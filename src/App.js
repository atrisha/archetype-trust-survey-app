// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

// Parse CSV string into objects - Simplified and more robust
const parseCSV = csv => {
  console.log('Raw CSV data:', csv.substring(0, 200) + '...');
  const lines = csv.trim().split('\n');
  console.log('Number of lines:', lines.length);
  
  if (lines.length === 0) return [];
  
  const headers = ['generated', 'message', 'in', 'roll']; // Fixed headers
  console.log('Using headers:', headers);
  
  const parsed = lines.slice(1).map((line, index) => {
    console.log(`Processing line ${index + 1}:`, line);
    
    // Simple CSV parsing - split by comma but handle quoted strings
    const values = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Double quote escape
          current += '"';
          i += 2;
        } else {
          // Toggle quotes
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        values.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    // Add the last field
    values.push(current.trim());
    
    console.log('Parsed values:', values);
    
    // Ensure we have at least 4 values
    while (values.length < 4) {
      values.push('');
    }
    
    const obj = {};
    headers.forEach((h, idx) => {
      let value = values[idx] || '';
      
      // Handle N/A values
      if (value === 'N/A' || value === '') {
        obj[h] = null;
      } else if (h === 'generated' || h === 'in' || h === 'roll') {
        // Parse integers
        obj[h] = parseInt(value, 10) || 0;
      } else {
        // String values
        obj[h] = value;
      }
    });
    
    console.log('Parsed object:', obj);
    
    // Filter out entries with empty messages
    if (!obj.message || obj.message.trim() === '') {
      console.log('Skipping entry with empty message');
      return null;
    }
    
    return obj;
  }).filter(obj => obj !== null);
  
  console.log('Final parsed data:', parsed);
  return parsed;
};

// Export JSON array to CSV and trigger download
const exportToCSV = data => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = [headers.join(',')];
  data.forEach(row => {
    const line = headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g,'""')}"`).join(',');
    rows.push(line);
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'survey_responses.csv';
  link.click();
};

function App() {
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState([]);
  const [responses, setResponses] = useState({});
  const [quantIndex, setQuantIndex] = useState(0);
  const [qualIndex, setQualIndex] = useState(0);
  const [sliderValues, setSliderValues] = useState({});

  useEffect(() => {
    console.log('Fetching data_clean.csv...');
    fetch('/data_clean.csv')
      .then(res => {
        console.log('Fetch response:', res.status, res.statusText);
        return res.text();
      })
      .then(csv=>{
        console.log('CSV text received, length:', csv.length);
        const all = parseCSV(csv);
        console.log('All parsed messages:', all.length);
        const g0 = all.filter(m=>m.generated===0);
        const g1 = all.filter(m=>m.generated===1);
        console.log('Generated=0 messages:', g0.length);
        console.log('Generated=1 messages:', g1.length);
        const shuffle = arr=>arr.sort(()=>0.5-Math.random());
        const sample = [...shuffle(g0).slice(0,5), ...shuffle(g1).slice(0,5)];
        console.log('Sample messages:', sample);
        const finalMessages = shuffle(sample).map((m,i)=>({ ...m, id:`msg_${i}` }));
        console.log('Final messages with IDs:', finalMessages);
        setMessages(finalMessages);        
      })
      .catch(error => {
        console.error('Error fetching or parsing CSV:', error);
      });
  },[]);

  const handleChange = useCallback((id,key,value) => {
    setResponses(prev=>({ ...prev, [id]:{ ...(prev[id]||{}), [key]:value }}));
    // Track slider values for display
    if (key === 'prediction' || key === 'signaling' || key === 'guilt') {
      setSliderValues(prev=>({ ...prev, [`${id}_${key}`]: value }));
    }
  },[]);

  const nextQuant = () => quantIndex < messages.length-1 ? setQuantIndex(q=>q+1) : setStep(2);
  const nextQual = () => qualIndex < messages.length-1 ? setQualIndex(q=>q+1) : (()=>{
    const out = messages.map(m=>({ id:m.id, message:m.message, generated:m.generated, ...responses[m.id] }));
    exportToCSV(out);
    setStep(3);
  })();

  // Page 1: Introduction
  if(step===0) return (
    <div className="survey-container fade-in">
      <div className="survey-card" style={{ maxWidth: '800px' }}>
        <div className="survey-header">
          <h1 className="survey-title">Trust Game Survey</h1>
          <p className="survey-subtitle">Understanding Communication in Trust Games</p>
        </div>
        <div className="survey-content">
          <div className="instructions">
            <h3>Welcome, Dear Participant!</h3>
            <p>Thank you for taking part in our survey about "Generating qualitative data."</p>
            <p>This survey is designed to understand the role of communication in a trust game. It is part of a project on how large language models can be used to simulate human behavior in games.</p>
            <p>The survey is divided into two parts: closed-ended (quantitative) and open-ended (qualitative) questions.</p>
            <p><strong>Privacy & Ethics:</strong> All answers are voluntary and you can leave the survey at any point. The answers are stored anonymously and under General Data Protection Regulations (GDPR). Moreover, responses will be used for academic purposes only.</p>
          </div>
          
          <div className="survey-section">
            <h3 style={{ color: '#4f46e5', marginBottom: '1rem' }}>Research Team</h3>
            <ul className="team-list">
              <li>Resource Economics Group, Humboldt‑Universität Berlin</li>
              <li>Arizona State University</li>
              <li>Institute for Advanced Studies (IHS), Vienna</li>
              <li>Western University, Canada</li>
            </ul>
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <button className="btn btn-primary" onClick={()=>setStep(1)}>
              Start Survey →
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Page 2: Quantitative
  if(step===1 && messages.length) {
    const m = messages[quantIndex];
    const progress = ((quantIndex + 1) / messages.length) * 100;
    console.log('Rendering quantitative step. Step:', step, 'Messages length:', messages.length, 'Current message:', m);
    return (
      <div className="survey-container slide-in">
        <div className="survey-card" style={{ maxWidth: '900px' }}>
          <div className="survey-header">
            <h2 className="survey-title" style={{ fontSize: '2rem' }}>Quantitative Survey</h2>
            <p className="survey-subtitle">Question {quantIndex+1} of {messages.length}</p>
          </div>
          
          <div className="survey-content">
            <div className="progress-indicator">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
            
            <div className="instructions">
              <h3>Instructions</h3>
              <p>Please evaluate short messages sent by trustees to trustors in a trust game setting. Messages can be real or simulated. Please find the rules of the trust game below.</p>
              <p>You will be separately presented {messages.length} messages sent by trustees. Please evaluate each message according to the offered dimensions.</p>
            </div>

            <div className="survey-section">
              <h3 style={{ color: '#4f46e5', marginBottom: '1rem' }}>Game Rules</h3>
              <p>Trust games are common experimental games to study trust between individuals. The game involves two players: a <strong>trustor</strong> and a <strong>trustee</strong>.</p>
              <p>The trustor makes the first move by choosing between two options: <strong>OUT</strong> or <strong>IN</strong>. If the trustor chooses <strong>OUT</strong>, the game ends immediately, and both players receive a modest, guaranteed payoff.</p>
              <p>If the trustor chooses <strong>IN</strong>, the trustee faces a decision: whether to <strong>ROLL</strong> or <strong>DON'T ROLL</strong> a virtual dice.</p>
              <p>If the trustee chooses <strong>ROLL</strong>, there is a high probability (e.g., 5 out of 6) that both players will receive a relatively high payoff. However, there is also a small chance (e.g., 1 out of 6) that the trustee will receive a higher payoff while the trustor receives nothing.</p>
              <p>If the trustee chooses <strong>DON'T ROLL</strong>, the trustee secures the high payoff for themselves with certainty, and the trustor receives nothing.</p>
              <p>Before the trustor makes their decision, the trustee can send a one-time, free-form message to the trustor. This message is non-binding and contains nothing that can be enforced.</p>
              
              <div className="diagram-container">
                <img 
                  src="/game_diag.png" 
                  alt="Trust Game Diagram" 
                />
              </div>
            </div>
            
            <div className="message-display">
              <h4 style={{ color: '#1e293b', marginBottom: '1rem', fontSize: '1.125rem' }}>Message sent by trustee to trustor:</h4>
              <p className="message-text">"{m?.message || 'No message available'}"</p>
            </div>

            <div className="form-group">
              <label className="form-label">Is the trustee making a commitment or promise to ROLL?</label>
              <div className="radio-group">
                <label className="radio-option">
                  <input 
                    type="radio" 
                    name={`commitment_${m.id}`}
                    value="explicit-promise"
                    onChange={e=>handleChange(m.id,'commitment',e.target.value)}
                  />
                  <div className="radio-option-content">
                    <div className="radio-option-title">Explicit Promise</div>
                    <div className="radio-option-description">The message indicates a return or cooperative action</div>
                  </div>
                </label>
                
                <label className="radio-option">
                  <input 
                    type="radio" 
                    name={`commitment_${m.id}`}
                    value="explicit-no-promise"
                    onChange={e=>handleChange(m.id,'commitment',e.target.value)}
                  />
                  <div className="radio-option-content">
                    <div className="radio-option-title">Explicit 'No Promise'</div>
                    <div className="radio-option-description">The message indicates a non-cooperative action</div>
                  </div>
                </label>
                
                <label className="radio-option">
                  <input 
                    type="radio" 
                    name={`commitment_${m.id}`}
                    value="implicit-suggestion"
                    onChange={e=>handleChange(m.id,'commitment',e.target.value)}
                  />
                  <div className="radio-option-content">
                    <div className="radio-option-title">Implicit Suggestion</div>
                    <div className="radio-option-description">A hint or persuasive language implying trustworthy behavior</div>
                  </div>
                </label>
                
                <label className="radio-option">
                  <input 
                    type="radio" 
                    name={`commitment_${m.id}`}
                    value="no-commitment"
                    onChange={e=>handleChange(m.id,'commitment',e.target.value)}
                  />
                  <div className="radio-option-content">
                    <div className="radio-option-title">No Commitment</div>
                    <div className="radio-option-description">The message does not imply any commitment to any future action</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">How much does the message signal a personal trait or characteristic of the trustee?</label>
              <div className="range-container">
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  className="range-slider"
                  defaultValue="3"
                  onChange={e => handleChange(m.id, 'signaling', e.target.value)}
                />
                <div className="range-labels">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                </div>
                <div className="range-descriptions">
                  <span>Not at all</span>
                  <span></span>
                  <span>Neutral</span>
                  <span></span>
                  <span>Very much</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="range-value-indicator">
                    {sliderValues[`${m.id}_signaling`] || '3'}
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Does the message convey emotions?</label>
              <div className="radio-group">
                <label className="radio-option">
                  <input 
                    type="radio" 
                    name={`emotion_${m.id}`}
                    value="neutral"
                    onChange={e=>handleChange(m.id,'emotion',e.target.value)}
                  />
                  <div className="radio-option-content">
                    <div className="radio-option-title">Neutral</div>
                    <div className="radio-option-description">The message does not express any particular emotions</div>
                  </div>
                </label>
                
                <label className="radio-option">
                  <input 
                    type="radio" 
                    name={`emotion_${m.id}`}
                    value="negative"
                    onChange={e=>handleChange(m.id,'emotion',e.target.value)}
                  />
                  <div className="radio-option-content">
                    <div className="radio-option-title">Negative emotions</div>
                    <div className="radio-option-description">The message expresses sadness, anger, fear, or other negative feelings</div>
                  </div>
                </label>
                
                <label className="radio-option">
                  <input 
                    type="radio" 
                    name={`emotion_${m.id}`}
                    value="positive"
                    onChange={e=>handleChange(m.id,'emotion',e.target.value)}
                  />
                  <div className="radio-option-content">
                    <div className="radio-option-title">Positive emotions</div>
                    <div className="radio-option-description">The message expresses happiness, excitement, optimism, or other positive feelings</div>
                  </div>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Imagine you received this message, how likely is it that the trustee who sent this message will choose ROLL?</label>
              <div className="range-container">
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="1"
                  className="range-slider" 
                  defaultValue="50"
                  onChange={e=>handleChange(m.id,'prediction',e.target.value)} 
                />
                <div className="range-labels">
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
                <div className="range-descriptions">
                  <span>Very unlikely</span>
                  <span></span>
                  <span>Neutral</span>
                  <span></span>
                  <span>Very likely</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="range-value-indicator">
                    {sliderValues[`${m.id}_prediction`] || '50'}%
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Imagine you are the trustee, how guilty would you feel to choose DON'T ROLL after sending this message?</label>
              <div className="range-container">
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  className="range-slider" 
                  defaultValue="3"
                  onChange={e=>handleChange(m.id,'guilt',e.target.value)} 
                />
                <div className="range-labels">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                </div>
                <div className="range-descriptions">
                  <span>Not guilty</span>
                  <span></span>
                  <span>Neutral</span>
                  <span></span>
                  <span>Very guilty</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="range-value-indicator">
                    {sliderValues[`${m.id}_guilt`] || '3'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button className="btn btn-success" onClick={nextQuant}>
                {quantIndex < messages.length - 1 ? 'Next Question →' : 'Continue to Qualitative Survey →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Page 3: Qualitative
  if(step===2 && messages.length) {
    const m = messages[qualIndex];
    const progress = ((qualIndex + 1) / messages.length) * 100;
    return (
      <div className="survey-container slide-in">
        <div className="survey-card" style={{ maxWidth: '900px' }}>
          <div className="survey-header">
            <h2 className="survey-title" style={{ fontSize: '2rem' }}>Qualitative Survey</h2>
            <p className="survey-subtitle">Question {qualIndex+1} of {messages.length}</p>
          </div>
          
          <div className="survey-content">
            <div className="progress-indicator">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
            </div>
            
            <div className="message-display">
              <h4 style={{ color: '#1e293b', marginBottom: '1rem', fontSize: '1.125rem' }}>Message from trustee:</h4>
              <p className="message-text">"{m.message}"</p>
            </div>

            <div className="form-group">
              <label className="form-label">Perspective trustor – social connection</label>
              <textarea 
                className="form-textarea" 
                rows={4} 
                placeholder="How might this message affect the social connection between trustor and trustee? Please elaborate on your thoughts..."
                onChange={e=>handleChange(m.id,'socialConnection',e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Trustee expectations</label>
              <textarea 
                className="form-textarea" 
                rows={4} 
                placeholder="What do you think the trustee expects from sending this message? What might be their underlying motivations?"
                onChange={e=>handleChange(m.id,'trusteeExpectations',e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Influence on trustor</label>
              <textarea 
                className="form-textarea" 
                rows={4} 
                placeholder="How might this message influence the trustor's behavior and decision-making? What psychological factors come into play?"
                onChange={e=>handleChange(m.id,'influenceBehavior',e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Guilt clues</label>
              <textarea 
                className="form-textarea" 
                rows={4} 
                placeholder="What elements in this message might induce guilt if the trustee doesn't follow through? Analyze the emotional undertones..."
                onChange={e=>handleChange(m.id,'guiltClues',e.target.value)} 
              />
            </div>

            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <button className="btn btn-success" onClick={nextQual}>
                {qualIndex < messages.length - 1 ? 'Next Question →' : 'Complete Survey →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Page 4: Thank You
  if(step===3) return (
    <div className="survey-container fade-in">
      <div className="survey-card" style={{ maxWidth: '600px' }}>
        <div className="survey-content">
          <div className="thank-you">
            <div className="thank-you-icon">✓</div>
            <h2 style={{ color: '#1e293b', fontSize: '2.25rem', marginBottom: '1rem' }}>Survey Complete!</h2>
            <p style={{ fontSize: '1.125rem', color: '#64748b', marginBottom: '2rem' }}>
              Thank you for your valuable participation in our research study.
            </p>
            <div className="instructions" style={{ textAlign: 'left' }}>
              <h3>What happens next?</h3>
              <p>Your responses have been automatically downloaded as a CSV file to your computer.</p>
              <p>Your anonymized data will contribute to important research on trust, communication, and human behavior in economic games.</p>
              <p>The insights from this study will help advance our understanding of how language influences trust and cooperation.</p>
            </div>
            <div style={{ marginTop: '2rem' }}>
              <p style={{ fontSize: '0.9rem', color: '#9ca3af', fontStyle: 'italic' }}>
                If you have any questions about this research, please contact our research team through the institutions listed at the beginning of this survey.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Debug case: Step 1 but no messages
  if(step === 1 && messages.length === 0) {
    console.log('Step 1 reached but no messages loaded');
    return (
      <div className="survey-container">
        <div className="survey-card" style={{ maxWidth: '600px' }}>
          <div className="survey-content">
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <h2 style={{ color: '#4f46e5', marginBottom: '1rem' }}>Loading Survey Data...</h2>
              <p style={{ color: '#64748b' }}>Please wait while we prepare your survey questions.</p>
              <div style={{ marginTop: '2rem', fontSize: '0.875rem', color: '#9ca3af' }}>
                <p>Debug info: Step = {step}, Messages = {messages.length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default App;
