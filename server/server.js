const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { query, transaction } = require('./database/db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the React app build directory (for production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../build')));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Trust Survey API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Get balanced sample of messages with configurable sample size
app.get('/api/messages/sample', async (req, res) => {
  try {
    const sampleSize = parseInt(req.query.size) || 10; // Default to 10 messages
    console.log(`Fetching balanced message sample of ${sampleSize} messages...`);
    
    const result = await query('SELECT * FROM get_balanced_message_sample($1) ORDER BY RANDOM()', [sampleSize]);
    
    // Format the messages to match frontend expectations
    const messages = result.rows.map((row, index) => ({
      id: `msg_${row.id}`, // Use database ID, not index
      message: row.message,
      generated: row.generated,
      in: row.in_role,
      roll: row.roll_value,
      generationType: row.generation_type,
      setQuant: row.set_quant,
      setQual: row.set_qual,
      dbId: row.id // Keep track of database ID
    }));
    
    console.log(`Retrieved ${messages.length} messages for survey`);
    res.json(messages);
    
  } catch (error) {
    console.error('Error fetching message sample:', error);
    res.status(500).json({ 
      error: 'Failed to fetch messages', 
      message: error.message 
    });
  }
});

// Create new survey session with set assignment
app.post('/api/sessions', async (req, res) => {
  try {
    const { participantId } = req.body;
    
    // Create session with assigned set_quant and set_qual
    const result = await query(`
      INSERT INTO survey_sessions (participant_id, set_quant, set_qual) 
      VALUES ($1, assign_set_quant(), assign_set_qual()) 
      RETURNING *
    `, [participantId || null]);
    
    const session = result.rows[0];
    console.log(`Created new survey session: ${session.id} with set_quant=${session.set_quant}, set_qual=${session.set_qual}`);
    
    res.json(session);
    
  } catch (error) {
    console.error('Error creating survey session:', error);
    res.status(500).json({ 
      error: 'Failed to create survey session', 
      message: error.message 
    });
  }
});

// Get messages for a specific session based on its assigned sets
app.get('/api/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // First get the session to retrieve its set assignments
    const sessionResult = await query(
      'SELECT set_quant, set_qual FROM survey_sessions WHERE id = $1',
      [sessionId]
    );
    
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const session = sessionResult.rows[0];
    console.log(`Fetching messages for session ${sessionId} with set_quant=${session.set_quant}, set_qual=${session.set_qual}`);
    
    // Get messages for this session's assigned sets
    const messagesResult = await query(
      'SELECT * FROM get_messages_for_session($1, $2)',
      [session.set_quant, session.set_qual]
    );
    
    // Format messages for frontend
    const quantitativeMessages = [];
    const qualitativeMessages = [];
    
    messagesResult.rows.forEach((row, index) => {
      const messageObj = {
        id: `msg_${row.id}`,
        message: row.message,
        generated: row.generated,
        in: row.in_role,
        roll: row.roll_value,
        setQuant: row.set_quant,
        setQual: row.set_qual,
        dbId: row.id
      };
      
      if (row.message_type === 'quantitative') {
        quantitativeMessages.push(messageObj);
      } else {
        qualitativeMessages.push(messageObj);
      }
    });
    
    console.log(`Retrieved ${quantitativeMessages.length} quantitative and ${qualitativeMessages.length} qualitative messages`);
    
    res.json({
      sessionId,
      setQuant: session.set_quant,
      setQual: session.set_qual,
      quantitativeMessages,
      qualitativeMessages,
      totalMessages: quantitativeMessages.length + qualitativeMessages.length
    });
    
  } catch (error) {
    console.error('Error fetching session messages:', error);
    res.status(500).json({ 
      error: 'Failed to fetch session messages', 
      message: error.message 
    });
  }
});

// Submit survey responses
app.post('/api/sessions/:sessionId/responses', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { responses, responseTimes, totalSessionTime, quantitativeMessages, qualitativeMessages } = req.body;
    
    console.log(`Submitting responses for session ${sessionId}...`);
    if (totalSessionTime) {
      console.log(`Total session time: ${Math.round(totalSessionTime / 1000)} seconds`);
    }
    
    // Combine both message arrays for processing
    const allMessages = [...(quantitativeMessages || []), ...(qualitativeMessages || [])];
    
    // Use transaction to ensure all responses are saved together
    await transaction(async (client) => {
      // Update session status to completed
      await client.query(
        'UPDATE survey_sessions SET session_end = CURRENT_TIMESTAMP, status = $1 WHERE id = $2',
        ['completed', sessionId]
      );
      
      // Insert all responses
      const insertQuery = `
        INSERT INTO survey_responses (
          session_id, message_id, commitment, signaling, emotion, 
          prediction, guilt, trustor_behavior, trustee_behavior, 
          guilt_clues, response_time_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;
      
      let savedCount = 0;
      for (const [messageId, response] of Object.entries(responses)) {
        // Find the database ID for this message
        const messageInfo = allMessages.find(m => m.id === messageId);
        if (!messageInfo || !messageInfo.dbId) {
          console.warn(`Could not find database ID for message ${messageId}`);
          continue;
        }
        
        try {
          // Calculate total response time for this message
          let totalResponseTime = 0;
          const messageFields = ['commitment', 'signaling', 'emotion', 'prediction', 'guilt', 'trusteeBehavior', 'trustorBehavior', 'guiltClues'];
          
          messageFields.forEach(field => {
            const timeKey = `${messageId}_${field}`;
            if (responseTimes && responseTimes[timeKey]) {
              totalResponseTime += responseTimes[timeKey];
            }
          });
          
          await client.query(insertQuery, [
            sessionId,
            messageInfo.dbId,
            response.commitment || null,
            response.signaling ? parseInt(response.signaling) : null,
            response.emotion || null,
            response.prediction ? parseInt(response.prediction) : null,
            response.guilt ? parseInt(response.guilt) : null,
            response.trustorBehavior || null,
            response.trusteeBehavior || null,
            response.guiltClues || null,
            totalResponseTime > 0 ? totalResponseTime : null
          ]);
          savedCount++;
        } catch (error) {
          console.error(`Error saving response for message ${messageId}:`, error.message);
        }
      }
      
      console.log(`Saved ${savedCount} responses for session ${sessionId}`);
    });
    
    res.json({ 
      success: true, 
      message: 'Survey responses saved successfully',
      sessionId 
    });
    
  } catch (error) {
    console.error('Error submitting survey responses:', error);
    res.status(500).json({ 
      error: 'Failed to save survey responses', 
      message: error.message 
    });
  }
});

// Get survey results (for admin/research purposes)
app.get('/api/results', async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    
    // Get comprehensive results with message details and session duration
    const results = await query(`
      SELECT 
        ss.id as session_id,
        ss.participant_id,
        ss.session_start,
        ss.session_end,
        EXTRACT(EPOCH FROM (ss.session_end - ss.session_start)) * 1000 as session_duration_ms,
        m.message,
        m.generated,
        m.in_role,
        m.roll_value,
        sr.commitment,
        sr.signaling,
        sr.emotion,
        sr.prediction,
        sr.guilt,
        sr.trustor_behavior,
        sr.trustee_behavior,
        sr.guilt_clues,
        sr.response_time_ms,
        sr.created_at as response_created
      FROM survey_sessions ss
      JOIN survey_responses sr ON ss.id = sr.session_id
      JOIN messages m ON sr.message_id = m.id
      WHERE ss.status = 'completed'
      ORDER BY ss.session_start, sr.created_at
    `);
    
    if (format === 'csv') {
      // Convert to CSV format
      if (results.rows.length === 0) {
        return res.status(404).json({ message: 'No completed surveys found' });
      }
      
      const headers = Object.keys(results.rows[0]);
      const csvContent = [
        headers.join(','),
        ...results.rows.map(row => 
          headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            return `"${String(value).replace(/"/g, '""')}"`;
          }).join(',')
        )
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=survey_results.csv');
      res.send(csvContent);
    } else {
      // Return JSON
      res.json({
        totalSessions: await query('SELECT COUNT(*) FROM survey_sessions WHERE status = \'completed\''),
        totalResponses: results.rows.length,
        results: results.rows
      });
    }
    
  } catch (error) {
    console.error('Error fetching survey results:', error);
    res.status(500).json({ 
      error: 'Failed to fetch survey results', 
      message: error.message 
    });
  }
});

// Get survey statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await Promise.all([
      query('SELECT COUNT(*) as total FROM survey_sessions'),
      query('SELECT COUNT(*) as completed FROM survey_sessions WHERE status = \'completed\''),
      query('SELECT COUNT(*) as in_progress FROM survey_sessions WHERE status = \'in_progress\''),
      query('SELECT COUNT(*) as total_messages FROM messages WHERE is_active = TRUE'),
      query(`
        SELECT generated, COUNT(*) as count 
        FROM messages WHERE is_active = TRUE 
        GROUP BY generated ORDER BY generated
      `),
      query('SELECT COUNT(*) as total_responses FROM survey_responses'),
      query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (session_end - session_start)) * 1000) as avg_session_duration_ms,
          AVG(response_time_ms) as avg_response_time_ms
        FROM survey_sessions ss
        LEFT JOIN survey_responses sr ON ss.id = sr.session_id
        WHERE ss.status = 'completed'
      `)
    ]);
    
    const messageBreakdown = {};
    stats[4].rows.forEach(row => {
      messageBreakdown[row.generated === 0 ? 'human' : 'ai'] = parseInt(row.count);
    });
    
    const timingStats = stats[6].rows[0];
    
    res.json({
      sessions: {
        total: parseInt(stats[0].rows[0].total),
        completed: parseInt(stats[1].rows[0].completed),
        inProgress: parseInt(stats[2].rows[0].in_progress)
      },
      messages: {
        total: parseInt(stats[3].rows[0].total_messages),
        breakdown: messageBreakdown
      },
      totalResponses: parseInt(stats[5].rows[0].total_responses),
      timing: {
        avgSessionDurationSeconds: timingStats.avg_session_duration_ms ? Math.round(timingStats.avg_session_duration_ms / 1000) : null,
        avgResponseTimeMs: timingStats.avg_response_time_ms ? Math.round(timingStats.avg_response_time_ms) : null
      }
    });
    
  } catch (error) {
    console.error('Error fetching survey statistics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics', 
      message: error.message 
    });
  }
});

// Delete incomplete session (when user quits before submitting)
app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Only delete sessions that don't have responses yet
    const result = await query(`
      DELETE FROM survey_sessions 
      WHERE id = $1 AND completed_at IS NULL
      RETURNING id
    `, [sessionId]);
    
    if (result.rows.length > 0) {
      console.log(`Deleted incomplete session: ${sessionId}`);
      res.json({ message: 'Session deleted successfully' });
    } else {
      res.status(404).json({ error: 'Session not found or already completed' });
    }
    
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ 
      error: 'Failed to delete session', 
      message: error.message 
    });
  }
});

// Admin endpoint to get all messages

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong' 
  });
});

// Catch all handler: send back React's index.html file for any non-API routes (production only)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../build', 'index.html'));
    } else {
      res.status(404).json({ error: 'API endpoint not found' });
    }
  });
} else {
  // 404 handler for development
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Trust Survey API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
