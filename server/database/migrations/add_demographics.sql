-- Migration: Add education and source columns to survey_sessions table
-- Date: 2026-02-XX
-- Description: Adds demographic fields to track participant education level and survey source

ALTER TABLE survey_sessions 
ADD COLUMN education VARCHAR(50),
ADD COLUMN source TEXT;

-- Add comments for documentation
COMMENT ON COLUMN survey_sessions.education IS 'Education level: high_school, undergraduate, postgraduate, other';
COMMENT ON COLUMN survey_sessions.source IS 'Where participant heard about the survey (free text)';
