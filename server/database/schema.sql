-- Trust Survey Database Schema

-- Messages table - stores the trust game messages
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    generated INTEGER NOT NULL CHECK (generated IN (0, 1)), -- 0 = human-written, 1 = AI-generated
    in_role INTEGER, -- the role context
    roll_value NUMERIC, -- roll value from original data (changed to NUMERIC to handle decimals)
    generation_type VARCHAR(100), -- new column for generation type information
    set_quant INTEGER, -- quantitative set identifier
    set_qual INTEGER, -- qualitative set identifier
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE -- for enabling/disabling messages
);

-- Survey sessions table - tracks individual survey sessions
CREATE TABLE survey_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    session_end TIMESTAMP WITH TIME ZONE,
    participant_id VARCHAR(255), -- optional participant identifier
    status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed, abandoned
    set_quant INTEGER, -- assigned quantitative set for this session
    set_qual INTEGER, -- assigned qualitative set for this session
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE -- when survey was completed
);

-- Survey responses table - stores all survey responses
CREATE TABLE survey_responses (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    message_id INTEGER NOT NULL,
    
    -- Quantitative responses
    commitment VARCHAR(50), -- explicit-promise, explicit-no-promise, implicit-suggestion, no-commitment
    signaling INTEGER CHECK (signaling BETWEEN 0 AND 5),
    emotion VARCHAR(20), -- neutral, negative, positive
    prediction INTEGER CHECK (prediction BETWEEN 0 AND 100),
    guilt INTEGER CHECK (guilt BETWEEN 0 AND 5),
    
    -- Qualitative responses
    trustor_behavior TEXT,
    trustee_behavior TEXT,
    guilt_clues TEXT,
    
    -- Metadata
    response_time_ms INTEGER, -- time spent on this response
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one response per message per session
    UNIQUE(session_id, message_id)
);

-- Create indexes for better performance
CREATE INDEX idx_messages_generated ON messages(generated);
CREATE INDEX idx_messages_active ON messages(is_active);
CREATE INDEX idx_messages_set_quant ON messages(set_quant);
CREATE INDEX idx_messages_set_qual ON messages(set_qual);
CREATE INDEX idx_survey_sessions_status ON survey_sessions(status);
CREATE INDEX idx_survey_sessions_created ON survey_sessions(created_at);
CREATE INDEX idx_survey_sessions_set_quant ON survey_sessions(set_quant);
CREATE INDEX idx_survey_sessions_set_qual ON survey_sessions(set_qual);
CREATE INDEX idx_survey_responses_session ON survey_responses(session_id);
CREATE INDEX idx_survey_responses_message ON survey_responses(message_id);
CREATE INDEX idx_survey_responses_created ON survey_responses(created_at);

-- Sample data insert (you can populate this with your existing CSV data)
-- Example messages (replace with your actual data)


-- View for getting random sample of messages for surveys
CREATE OR REPLACE VIEW random_messages AS
SELECT * FROM messages 
WHERE is_active = TRUE
ORDER BY RANDOM();

-- Function to get balanced sample of messages (parameterized count)
CREATE OR REPLACE FUNCTION get_balanced_message_sample(sample_size INTEGER DEFAULT 10)
RETURNS TABLE (
    id INTEGER,
    message TEXT,
    generated INTEGER,
    in_role INTEGER,
    roll_value NUMERIC,
    generation_type VARCHAR(100),
    set_quant INTEGER,
    set_qual INTEGER
) AS $$
DECLARE
    half_size INTEGER;
BEGIN
    -- Calculate half the sample size (rounded up for odd numbers)
    half_size := CEIL(sample_size::FLOAT / 2.0)::INTEGER;
    
    RETURN QUERY
    (
        SELECT m.id, m.message, m.generated, m.in_role, m.roll_value, m.generation_type, m.set_quant, m.set_qual
        FROM messages m
        WHERE m.is_active = TRUE AND m.generated = 0
        ORDER BY RANDOM()
        LIMIT half_size
    )
    UNION ALL
    (
        SELECT m.id, m.message, m.generated, m.in_role, m.roll_value, m.generation_type, m.set_quant, m.set_qual
        FROM messages m
        WHERE m.is_active = TRUE AND m.generated = 1
        ORDER BY RANDOM()
        LIMIT (sample_size - half_size)
    );
END;
$$ LANGUAGE plpgsql;

-- Function to assign set_quant for a new session
CREATE OR REPLACE FUNCTION assign_set_quant()
RETURNS INTEGER AS $$
DECLARE
    target_count INTEGER;
    assigned_set INTEGER;
BEGIN
    -- First, try to find a set_quant with exactly 1 session
    SELECT DISTINCT s.set_quant INTO assigned_set
    FROM survey_sessions s
    WHERE s.set_quant IS NOT NULL AND s.set_quant > 0
    GROUP BY s.set_quant
    HAVING COUNT(*) = 1
    LIMIT 1;
    
    -- If found, return it
    IF assigned_set IS NOT NULL THEN
        RETURN assigned_set;
    END IF;
    
    -- Otherwise, find the minimum count and randomly select from those sets
    SELECT MIN(counts.session_count) INTO target_count
    FROM (
        SELECT s.set_quant, COUNT(*) as session_count
        FROM survey_sessions s
        WHERE s.set_quant IS NOT NULL AND s.set_quant > 0
        GROUP BY s.set_quant
        UNION ALL
        SELECT DISTINCT m.set_quant, 0 as session_count
        FROM messages m
        WHERE m.set_quant IS NOT NULL AND m.set_quant > 0
        AND m.set_quant NOT IN (
            SELECT DISTINCT s.set_quant 
            FROM survey_sessions s 
            WHERE s.set_quant IS NOT NULL
        )
    ) counts;
    
    -- If no sessions exist yet, get a random set_quant from available sets
    IF target_count IS NULL THEN
        SELECT DISTINCT m.set_quant INTO assigned_set
        FROM messages m
        WHERE m.set_quant IS NOT NULL AND m.set_quant > 0 AND m.is_active = TRUE
        ORDER BY RANDOM()
        LIMIT 1;
        RETURN assigned_set;
    END IF;
    
    -- Select randomly from sets with minimum count
    SELECT set_quant INTO assigned_set
    FROM (
        SELECT s.set_quant, COUNT(*) as session_count
        FROM survey_sessions s
        WHERE s.set_quant IS NOT NULL AND s.set_quant > 0
        GROUP BY s.set_quant
        HAVING COUNT(*) = target_count
        UNION ALL
        SELECT DISTINCT m.set_quant, 0 as session_count
        FROM messages m
        WHERE m.set_quant IS NOT NULL AND m.set_quant > 0
        AND m.set_quant NOT IN (
            SELECT DISTINCT s.set_quant 
            FROM survey_sessions s 
            WHERE s.set_quant IS NOT NULL AND s.set_quant > 0
        )
        AND 0 = target_count
    ) candidates
    ORDER BY RANDOM()
    LIMIT 1;
    
    RETURN assigned_set;
END;
$$ LANGUAGE plpgsql;

-- Function to assign set_qual for a new session
CREATE OR REPLACE FUNCTION assign_set_qual()
RETURNS INTEGER AS $$
DECLARE
    target_count INTEGER;
    assigned_set INTEGER;
BEGIN
    -- First, try to find a set_qual with exactly 1 session
    SELECT DISTINCT s.set_qual INTO assigned_set
    FROM survey_sessions s
    WHERE s.set_qual IS NOT NULL AND s.set_qual > 0
    GROUP BY s.set_qual
    HAVING COUNT(*) = 1
    LIMIT 1;
    
    -- If found, return it
    IF assigned_set IS NOT NULL THEN
        RETURN assigned_set;
    END IF;
    
    -- Otherwise, find the minimum count and randomly select from those sets
    SELECT MIN(counts.session_count) INTO target_count
    FROM (
        SELECT s.set_qual, COUNT(*) as session_count
        FROM survey_sessions s
        WHERE s.set_qual IS NOT NULL AND s.set_qual > 0
        GROUP BY s.set_qual
        UNION ALL
        SELECT DISTINCT m.set_qual, 0 as session_count
        FROM messages m
        WHERE m.set_qual IS NOT NULL AND m.set_qual > 0
        AND m.set_qual NOT IN (
            SELECT DISTINCT s.set_qual 
            FROM survey_sessions s 
            WHERE s.set_qual IS NOT NULL
        )
    ) counts;
    
    -- If no sessions exist yet, get a random set_qual from available sets
    IF target_count IS NULL THEN
        SELECT DISTINCT m.set_qual INTO assigned_set
        FROM messages m
        WHERE m.set_qual IS NOT NULL AND m.set_qual > 0 AND m.is_active = TRUE
        ORDER BY RANDOM()
        LIMIT 1;
        RETURN assigned_set;
    END IF;
    
    -- Select randomly from sets with minimum count
    SELECT set_qual INTO assigned_set
    FROM (
        SELECT s.set_qual, COUNT(*) as session_count
        FROM survey_sessions s
        WHERE s.set_qual IS NOT NULL AND s.set_qual > 0
        GROUP BY s.set_qual
        HAVING COUNT(*) = target_count
        UNION ALL
        SELECT DISTINCT m.set_qual, 0 as session_count
        FROM messages m
        WHERE m.set_qual IS NOT NULL AND m.set_qual > 0
        AND m.set_qual NOT IN (
            SELECT DISTINCT s.set_qual 
            FROM survey_sessions s 
            WHERE s.set_qual IS NOT NULL AND s.set_qual > 0
        )
        AND 0 = target_count
    ) candidates
    ORDER BY RANDOM()
    LIMIT 1;
    
    RETURN assigned_set;
END;
$$ LANGUAGE plpgsql;

-- Function to get messages for a specific set combination
CREATE OR REPLACE FUNCTION get_messages_for_session(session_set_quant INTEGER, session_set_qual INTEGER)
RETURNS TABLE (
    id INTEGER,
    message TEXT,
    generated INTEGER,
    in_role INTEGER,
    roll_value NUMERIC,
    generation_type VARCHAR(100),
    set_quant INTEGER,
    set_qual INTEGER,
    message_type VARCHAR(20) -- 'quantitative' or 'qualitative'
) AS $$
BEGIN
    RETURN QUERY
    (
        -- Get quantitative messages (matching set_quant)
        SELECT m.id, m.message, m.generated, m.in_role, m.roll_value, m.generation_type, m.set_quant, m.set_qual, 'quantitative'::VARCHAR(20)
        FROM messages m
        WHERE m.is_active = TRUE 
        AND m.set_quant = session_set_quant
        AND m.set_quant > 0
        ORDER BY m.id
    )
    UNION ALL
    (
        -- Get qualitative messages (matching set_qual)
        SELECT m.id, m.message, m.generated, m.in_role, m.roll_value, m.generation_type, m.set_quant, m.set_qual, 'qualitative'::VARCHAR(20)
        FROM messages m
        WHERE m.is_active = TRUE 
        AND m.set_qual = session_set_qual
        AND m.set_qual > 0
        ORDER BY m.id
    );
END;
$$ LANGUAGE plpgsql;
