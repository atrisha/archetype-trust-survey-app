// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

function App() {
  const [step, setStep] = useState(0);
  const [quantitativeMessages, setQuantitativeMessages] = useState([]);
  const [qualitativeMessages, setQualitativeMessages] = useState([]);
  const [responses, setResponses] = useState({});
  const [sliderValues, setSliderValues] = useState({});
  const [interactedInputs, setInteractedInputs] = useState({});
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Time tracking
  const [startTime, setStartTime] = useState(null);
  const [responseStartTimes, setResponseStartTimes] = useState({});
  const [responseTimes, setResponseTimes] = useState({});

  useEffect(() => {
    async function initializeSurvey() {
      try {
        setIsLoading(true);
        setError(null);
        
        // Create a new survey session
        console.log('Creating survey session...');
        const sessionResponse = await fetch('/api/sessions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            participantId: null // You can add participant identification later
          })
        });
        
        if (!sessionResponse.ok) {
          throw new Error('Failed to create survey session');
        }
        
        const session = await sessionResponse.json();
        setSessionId(session.id);
        console.log('Survey session created:', session.id);
        
        // Fetch message samples from API
        console.log('Fetching message samples...');
        
        // Fetch 10 messages for quantitative questions
        const quantitativeResponse = await fetch('/api/messages/sample?size=10');
        if (!quantitativeResponse.ok) {
          throw new Error('Failed to fetch quantitative messages');
        }
        const quantitativeData = await quantitativeResponse.json();
        console.log('Received quantitative messages:', quantitativeData);
        setQuantitativeMessages(quantitativeData);
        
        // Fetch 4 messages for qualitative questions
        const qualitativeResponse = await fetch('/api/messages/sample?size=4');
        if (!qualitativeResponse.ok) {
          throw new Error('Failed to fetch qualitative messages');
        }
        const qualitativeData = await qualitativeResponse.json();
        console.log('Received qualitative messages:', qualitativeData);
        setQualitativeMessages(qualitativeData);
        
        // Initialize slider values to 0 for quantitative messages
        const initialValues = {};
        quantitativeData.forEach(msg => {
          initialValues[`${msg.id}_signaling`] = '0';
          initialValues[`${msg.id}_prediction`] = '0';
          initialValues[`${msg.id}_guilt`] = '0';
        });
        setSliderValues(initialValues);
        
      } catch (error) {
        console.error('Error initializing survey:', error);
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    }
    
    initializeSurvey();
  }, []);

  // Helper function to track response start time
  const trackResponseStart = useCallback((inputKey) => {
    setResponseStartTimes(prev => {
      if (!prev[inputKey]) {
        return {
          ...prev,
          [inputKey]: Date.now()
        };
      }
      return prev;
    });
  }, []);

  // Helper function to record response time when user completes a response
  const recordResponseTime = useCallback((inputKey) => {
    setResponseStartTimes(prev => {
      if (prev[inputKey]) {
        const responseTime = Date.now() - prev[inputKey];
        setResponseTimes(prevTimes => ({
          ...prevTimes,
          [inputKey]: responseTime
        }));
      }
      return prev;
    });
  }, []);

  const handleChange = useCallback((id,key,value) => {
    const inputKey = `${id}_${key}`;
    
    // Track when user starts interacting with this response
    trackResponseStart(inputKey);
    
    setResponses(prev=>({ ...prev, [id]:{ ...(prev[id]||{}), [key]:value }}));
    // Track slider values for display
    if (key === 'prediction' || key === 'signaling' || key === 'guilt') {
      setSliderValues(prev=>({ ...prev, [`${id}_${key}`]: value }));
    }
    // Mark this input as interacted with and record response time
    setInteractedInputs(prev=>({ ...prev, [`${id}_${key}`]: true }));
    recordResponseTime(inputKey);
  }, [trackResponseStart, recordResponseTime]);

  const validateQuantitativePage = () => {
    const requiredFields = [];
    quantitativeMessages.forEach(msg => {
      requiredFields.push(
        `${msg.id}_commitment`,
        `${msg.id}_signaling`,
        `${msg.id}_emotion`,
        `${msg.id}_prediction`,
        `${msg.id}_guilt`
      );
    });

    const missingFields = requiredFields.filter(field => !interactedInputs[field]);
    return missingFields.length === 0;
  };

  const validateQualitativePage = () => {
    const requiredFields = [];
    qualitativeMessages.forEach(msg => {
      requiredFields.push(
        `${msg.id}_socialConnection`,
        `${msg.id}_trusteeExpectations`,
        `${msg.id}_influenceBehavior`,
        `${msg.id}_guiltClues`
      );
    });

    const missingFields = requiredFields.filter(field => !interactedInputs[field]);
    return missingFields.length === 0;
  };

  const handleNextPage = () => {
    if (validateQuantitativePage()) {
      setStep(2);
    } else {
      alert('Please complete all fields on this page before proceeding. Make sure you have selected/adjusted values for all questions and messages.');
    }
  };

  const handleSubmit = async () => {
    if (validateQualitativePage()) {
      try {
        setIsLoading(true);
        
        console.log('Submitting survey responses...');
        const totalSessionTime = startTime ? Date.now() - startTime : null;
        
        const submitResponse = await fetch(`/api/sessions/${sessionId}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            responses,
            responseTimes, // Include response times for each input
            totalSessionTime, // Total time spent in survey
            quantitativeMessages, // Include quantitative message metadata 
            qualitativeMessages   // Include qualitative message metadata
          })
        });
        
        if (!submitResponse.ok) {
          throw new Error('Failed to submit survey responses');
        }
        
        const result = await submitResponse.json();
        console.log('Survey responses submitted successfully:', result);
        
        setStep(3); // Go to thank you page
        
      } catch (error) {
        console.error('Error submitting survey:', error);
        alert('There was an error submitting your responses. Please try again or contact support.');
      } finally {
        setIsLoading(false);
      }
    } else {
      alert('Please complete all text fields on this page before submitting. Make sure you have provided responses for all qualitative questions.');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="survey-container">
        <div className="survey-card" style={{ maxWidth: '500px', textAlign: 'center' }}>
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <h3>Loading Survey...</h3>
            <p>Please wait while we prepare your survey questions.</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="survey-container">
        <div className="survey-card" style={{ maxWidth: '500px', textAlign: 'center' }}>
          <div className="survey-content">
            <h3 style={{ color: '#ef4444' }}>Error Loading Survey</h3>
            <p>We're sorry, but there was an error loading the survey: {error}</p>
            <p>Please refresh the page or try again later.</p>
            <button 
              className="btn btn-primary" 
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

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
            <p>The survey is presented in a table format where you can evaluate all messages at once across different dimensions.</p>
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
          
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <button className="btn btn-primary" onClick={() => {
              setStartTime(Date.now());
              setStep(1);
            }}>
              Start Survey →
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Page 2: First Table Survey (Quantitative)
  if(step===1 && quantitativeMessages.length) {
    return (
      <div className="survey-container slide-in">
        <div className="survey-card" style={{ maxWidth: '1200px', width: '95vw' }}>
          <div className="survey-header">
            <h2 className="survey-title" style={{ fontSize: '2rem' }}>Survey Table - Page 1</h2>
            <p className="survey-subtitle">Quantitative Evaluation: Rate each message across different dimensions</p>
          </div>
          
          <div className="survey-content">
            <div className="instructions">
              <h3>Instructions</h3>
              <p>Please evaluate all messages sent by trustees to trustors in a trust game setting. Use the table below to provide your quantitative responses for each message.</p>
            </div>

            <div className="survey-table-container">
              <table className="survey-table">
                <thead>
                  <tr>
                    <th>Message</th>
                    <th>Commitment/Promise</th>
                    <th>Personal Signaling (1-5)</th>
                    <th>Emotions</th>
                    <th>ROLL Likelihood (0-100%)</th>
                    <th>Guilt Level (1-5)</th>
                  </tr>
                </thead>
                <tbody>
                  {quantitativeMessages.map((m, index) => (
                    <tr key={m.id}>
                      <td className="message-cell">
                        "{m.message}"
                      </td>
                      
                      {/* Commitment Radio Group */}
                      <td className="input-cell">
                        <div className={`table-radio-group ${interactedInputs[`${m.id}_commitment`] ? 'completed' : ''}`}>
                          {[
                            { value: 'explicit-promise', label: 'Explicit Promise' },
                            { value: 'explicit-no-promise', label: 'Explicit No Promise' },
                            { value: 'implicit-suggestion', label: 'Implicit Suggestion' },
                            { value: 'no-commitment', label: 'No Commitment' }
                          ].map(option => (
                            <label key={option.value} className={`table-radio-option ${responses[m.id]?.commitment === option.value ? 'selected' : ''}`}>
                              <input 
                                type="radio" 
                                name={`commitment_${m.id}`}
                                value={option.value}
                                onChange={e=>handleChange(m.id,'commitment',e.target.value)}
                              />
                              <span className="table-radio-label">{option.label}</span>
                            </label>
                          ))}
                          {!interactedInputs[`${m.id}_commitment`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Signaling Slider */}
                      <td className="input-cell">
                        <div className={`table-range-container ${interactedInputs[`${m.id}_signaling`] ? 'completed' : ''}`}>
                          <input
                            type="range"
                            min="0"
                            max="5"
                            step="1"
                            className="table-range-slider"
                            value={sliderValues[`${m.id}_signaling`] || '0'}
                            onChange={e => handleChange(m.id, 'signaling', e.target.value)}
                          />
                          <div className="table-range-labels">
                            <span>Not at all</span>
                            <span>Very much</span>
                          </div>
                          <div className="table-range-value">
                            {sliderValues[`${m.id}_signaling`] || '0'}
                          </div>
                          {!interactedInputs[`${m.id}_signaling`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Emotion Radio Group */}
                      <td className="input-cell">
                        <div className={`table-radio-group ${interactedInputs[`${m.id}_emotion`] ? 'completed' : ''}`}>
                          {[
                            { value: 'neutral', label: 'Neutral' },
                            { value: 'negative', label: 'Negative' },
                            { value: 'positive', label: 'Positive' }
                          ].map(option => (
                            <label key={option.value} className={`table-radio-option ${responses[m.id]?.emotion === option.value ? 'selected' : ''}`}>
                              <input 
                                type="radio" 
                                name={`emotion_${m.id}`}
                                value={option.value}
                                onChange={e=>handleChange(m.id,'emotion',e.target.value)}
                              />
                              <span className="table-radio-label">{option.label}</span>
                            </label>
                          ))}
                          {!interactedInputs[`${m.id}_emotion`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Prediction Slider */}
                      <td className="input-cell">
                        <div className={`table-range-container ${interactedInputs[`${m.id}_prediction`] ? 'completed' : ''}`}>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            step="1"
                            className="table-range-slider" 
                            value={sliderValues[`${m.id}_prediction`] || '0'}
                            onChange={e=>handleChange(m.id,'prediction',e.target.value)} 
                          />
                          <div className="table-range-labels">
                            <span>Very unlikely</span>
                            <span>Very likely</span>
                          </div>
                          <div className="table-range-value">
                            {sliderValues[`${m.id}_prediction`] || '0'}%
                          </div>
                          {!interactedInputs[`${m.id}_prediction`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Guilt Slider */}
                      <td className="input-cell">
                        <div className={`table-range-container ${interactedInputs[`${m.id}_guilt`] ? 'completed' : ''}`}>
                          <input 
                            type="range" 
                            min="0" 
                            max="5" 
                            className="table-range-slider" 
                            value={sliderValues[`${m.id}_guilt`] || '0'}
                            onChange={e=>handleChange(m.id,'guilt',e.target.value)} 
                          />
                          <div className="table-range-labels">
                            <span>Not guilty</span>
                            <span>Very guilty</span>
                          </div>
                          <div className="table-range-value">
                            {sliderValues[`${m.id}_guilt`] || '0'}
                          </div>
                          {!interactedInputs[`${m.id}_guilt`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="submit-section">
              <button className="btn btn-primary btn-lg" onClick={handleNextPage}>
                Continue to Qualitative Questions →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Page 3: Second Table Survey (Qualitative)
  if(step===2 && qualitativeMessages.length) {
    return (
      <div className="survey-container slide-in">
        <div className="survey-card" style={{ maxWidth: '1400px', width: '95vw' }}>
          <div className="survey-header">
            <h2 className="survey-title" style={{ fontSize: '2rem' }}>Survey Table - Page 2</h2>
            <p className="survey-subtitle">Qualitative Evaluation: Provide detailed responses for each message</p>
          </div>
          
          <div className="survey-content">
            <div className="instructions">
              <h3>Instructions</h3>
              <p>Now please provide qualitative insights about each message. Use the text areas below to elaborate on your thoughts and analysis.</p>
            </div>

            <div className="survey-table-container">
              <table className="survey-table">
                <thead>
                  <tr>
                    <th>Message</th>
                    <th>Social Connection</th>
                    <th>Trustee Expectations</th>
                    <th>Influence on Trustor</th>
                    <th>Guilt Clues</th>
                  </tr>
                </thead>
                <tbody>
                  {qualitativeMessages.map((m, index) => (
                    <tr key={m.id}>
                      <td className="message-cell">
                        "{m.message}"
                      </td>
                      
                      {/* Social Connection Textarea */}
                      <td className="input-cell">
                        <div className={`textarea-container ${interactedInputs[`${m.id}_socialConnection`] ? 'completed' : ''}`}>
                          <textarea 
                            className="form-textarea" 
                            rows={4} 
                            style={{ width: '100%', minWidth: '250px', fontSize: '0.875rem' }}
                            placeholder="How might this message affect the social connection between trustor and trustee? Please elaborate on your thoughts..."
                            onChange={e=>handleChange(m.id,'socialConnection',e.target.value)} 
                          />
                          {!interactedInputs[`${m.id}_socialConnection`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Trustee Expectations Textarea */}
                      <td className="input-cell">
                        <div className={`textarea-container ${interactedInputs[`${m.id}_trusteeExpectations`] ? 'completed' : ''}`}>
                          <textarea 
                            className="form-textarea" 
                            rows={4} 
                            style={{ width: '100%', minWidth: '250px', fontSize: '0.875rem' }}
                            placeholder="What do you think the trustee expects from sending this message? What might be their underlying motivations?"
                            onChange={e=>handleChange(m.id,'trusteeExpectations',e.target.value)} 
                          />
                          {!interactedInputs[`${m.id}_trusteeExpectations`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Influence Behavior Textarea */}
                      <td className="input-cell">
                        <div className={`textarea-container ${interactedInputs[`${m.id}_influenceBehavior`] ? 'completed' : ''}`}>
                          <textarea 
                            className="form-textarea" 
                            rows={4} 
                            style={{ width: '100%', minWidth: '250px', fontSize: '0.875rem' }}
                            placeholder="How might this message influence the trustor's behavior and decision-making? What psychological factors come into play?"
                            onChange={e=>handleChange(m.id,'influenceBehavior',e.target.value)} 
                          />
                          {!interactedInputs[`${m.id}_influenceBehavior`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Guilt Clues Textarea */}
                      <td className="input-cell">
                        <div className={`textarea-container ${interactedInputs[`${m.id}_guiltClues`] ? 'completed' : ''}`}>
                          <textarea 
                            className="form-textarea" 
                            rows={4} 
                            style={{ width: '100%', minWidth: '250px', fontSize: '0.875rem' }}
                            placeholder="What elements in this message might induce guilt if the trustee doesn't follow through? Analyze the emotional undertones..."
                            onChange={e=>handleChange(m.id,'guiltClues',e.target.value)} 
                          />
                          {!interactedInputs[`${m.id}_guiltClues`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="submit-section">
              <button className="btn btn-success btn-lg" onClick={handleSubmit}>
                Submit Survey
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
              <p>Your responses have been securely saved to our research database.</p>
              <p>Your anonymized data will contribute to important research on trust, communication, and human behavior in economic games.</p>
              <p>The insights from this study will help advance our understanding of how language influences trust and cooperation.</p>
              {sessionId && (
                <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '1rem' }}>
                  Session ID: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{sessionId}</code>
                </p>
              )}
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
  if(step === 1 && quantitativeMessages.length === 0) {
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
                <p>Debug info: Step = {step}, Quantitative = {quantitativeMessages.length}, Qualitative = {qualitativeMessages.length}</p>
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