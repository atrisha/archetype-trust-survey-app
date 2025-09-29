// src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

function App() {
  const [step, setStep] = useState(0);
  const [quantitativeMessages, setQuantitativeMessages] = useState([]);
  const [qualitativeMessages, setQualitativeMessages] = useState([]);
  const [responses, setResponses] = useState({});
  const [sliderValues, setSliderValues] = useState({});
  const [interactedInputs, setInteractedInputs] = useState({});
  const [sessionId, setSessionId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isQuitting, setIsQuitting] = useState(false);
  
  // Definition visibility state
  const [showDefinitions, setShowDefinitions] = useState({
    commitment: false,
    signaling: false,
    emotion: false,
    prediction: false,
    guilt: false
  });
  
  // Time tracking
  const [startTime, setStartTime] = useState(null);
  const [responseStartTimes, setResponseStartTimes] = useState({});
  const [responseTimes, setResponseTimes] = useState({});
  const isInitializedRef = useRef(false);

  // Remove the problematic useEffect entirely

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
      console.log('Fetching messages for session:', session.id);
      
      // Fetch messages specific to this session's set assignments
      const messagesResponse = await fetch(`/api/sessions/${session.id}/messages`);
      if (!messagesResponse.ok) {
        throw new Error('Failed to fetch session messages');
      }
      const messagesData = await messagesResponse.json();
      console.log('Received session messages:', messagesData);      setQuantitativeMessages(messagesData.quantitativeMessages);
      setQualitativeMessages(messagesData.qualitativeMessages);
      
      console.log(`Session ${sessionId} - set_quant: ${messagesData.setQuant}, set_qual: ${messagesData.setQual}`);
      console.log(`Loaded ${messagesData.quantitativeMessages.length} quantitative and ${messagesData.qualitativeMessages.length} qualitative messages`);
      
      // Initialize slider values to 0 for quantitative messages
      const initialValues = {};
      messagesData.quantitativeMessages.forEach(msg => {
        initialValues[`${msg.id}_signaling`] = '0';
        initialValues[`${msg.id}_prediction`] = '0';
        initialValues[`${msg.id}_guilt`] = '0';
      });
      setSliderValues(initialValues);
      
    } catch (error) {
      console.error('Error initializing survey:', error);
      setError(error.message);
      isInitializedRef.current = false; // Reset flag so user can try again
    } finally {
      setIsLoading(false);
    }
  }
  
  // Helper function to toggle definition visibility
  const toggleDefinitions = useCallback((columnType) => {
    setShowDefinitions(prev => ({
      ...prev,
      [columnType]: !prev[columnType]
    }));
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
        `${msg.id}_trusteeBehavior`,
        `${msg.id}_trustorBehavior`,
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
        console.log('🔒 PERSISTING DATA TO DATABASE - This is the only point where user data is saved');
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

  const handleQuitStudy = async () => {
    if (window.confirm('Are you sure you want to quit the study?\n\nYour progress will not be saved and you will not be able to return to complete the survey.\n\nClick "OK" to quit or "Cancel" to continue.')) {
      setIsQuitting(true);
      
      // Redirect after a short delay
      setTimeout(() => {
        window.location.href = 'about:blank'; // This will show a blank page
      }, 2000); // Show quit message for 2 seconds before redirecting
    }
  };

  // Quit state
  if (isQuitting) {
    return (
      <div className="app">
        <div className="survey-card">
          <h1>Study Exited</h1>
          <div className="thank-you-message">
            <p>Thank you for your time and interest in this research study.</p>
            <p>You have successfully exited the survey. Your session has been terminated.</p>
            <p>If you have any questions about this research, please contact the study coordinator.</p>
          </div>
        </div>
      </div>
    );
  }

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
            <h3>Letter of Information and Consent</h3>
            <h4>Project Title: Generating test data for qualitative methods</h4>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <h4>Principal Investigators:</h4>
              <ul style={{ marginLeft: '1rem', marginBottom: '1rem' }}>
                <li>Rimjhim Aggarwal, PhD, School of Sustainability, Arizona State University, Rimjhim.Aggarwal@asu.edu</li>
                <li>Klaus Eisenack, PhD, Resource Economics Group, Humboldt-Universität, resource-economics@hu-berlin.de</li>
                <li>Christian Kimmich, PhD, Institute for Advanced Studies, Vienna, kimmich@ihs.ac.at</li>
                <li>Atrisha Sarkar, PhD, Dept. of Electrical and Computer Engineering, Western University, atrisha.sarkar@uwo.ca</li>
                <li>Rongyu Wang, PhD, Xiamen University</li>
                
                
              </ul>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>1. Invitation to Participate</h4>
              <p>You are being invited to participate in a research study about how people perceive communication from large language models (AI). This study is being conducted by researchers at Humboldt University of Berlin, Institute for Advanced Studies, Arizona State University, and Western University. You have been invited to participate because you are an expert (faculty or graduate student) in the field of social simulation, resource economics, or sustainability, and your insights are valuable to this research.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>2. Why is this study being done?</h4>
              <p>The purpose of this study is to evaluate if communication generated by an AI can be perceived as similar to communication from a human. We are doing this because there is a growing interest in using AI as a tool to simulate human behavior in social science research, but it is critical to determine if the AI's outputs are a good match for real human data in experimental games for resource economics research. Your expert judgment will help us answer this question. The results of this study will help researchers understand the validity of using AI-generated data in future social science studies.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>3. How long will you be in this study?</h4>
              <p>Your participation will involve a single online survey that is expected to take approximately 15-30 minutes to complete.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>4. What will happen during this study?</h4>
              <p>If you agree to participate, you will be asked to complete a single online survey. There are no separate sessions. The survey will involve the following steps:</p>
              <ul style={{ marginLeft: '1rem' }}>
                <li>You will be shown a selected set of games and the communication messages sent within those games.</li>
                <li>You will be asked to evaluate these messages. The survey has two parts:
                  <ul style={{ marginLeft: '1rem', marginTop: '0.5rem' }}>
                    <li>A quantitative section where you will rate the messages on specific criteria (i.e., commitment, emotion, predicted behavior).</li>
                    <li>A qualitative section where you will provide short, textual justifications in response to open-ended questions about the messages.</li>
                  </ul>
                </li>
                <li>You will be able to complete the survey at your convenience.</li>
              </ul>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>5. What are the risks and harms of participating in this study?</h4>
              <p>The risks associated with participating in this study are considered minimal. You may experience minor boredom or fatigue from completing the survey, similar to what you might encounter when filling out any online form.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>6. What are the potential benefits of participating in this study?</h4>
              <p>You may not directly benefit from participating in this study. However, the information gathered may provide benefits to the social science community as a whole by helping researchers and designers better understand the potential and limitations of using AI to simulate human behavior.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>7. How will your information be kept confidential?</h4>
              <p>All information we collect from you will be treated with the utmost confidentiality. We will not collect directly identifying information such as your name.</p>
              <ul style={{ marginLeft: '1rem' }}>
                <li>During the study, your responses will be coded with a unique, randomly generated participant ID. This coded data is temporarily stored on secure servers managed by our service providers.</li>
                <li>After data collection is complete, the list linking your participant ID to your coded data will be permanently destroyed. At this point, the data becomes fully anonymized.</li>
                <li>The anonymized research data will be stored on a secure, encrypted, and password-protected server at Humboldt University for a minimum of 7 years. Access to this data will be restricted to the researchers listed on this form.</li>
                <li>If the results of the study are published, your name will not be used, and no information that could identify you will be included.</li>
              </ul>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>8. Will you be compensated for your participation?</h4>
              <p>No. Given the nature of this research as an expert survey, there is no monetary compensation for participation.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>9. Can you choose to leave the study?</h4>
              <p>Your participation in this study is voluntary. You can choose to leave the study at any time by closing your browser window or clicking the 'quit study' button. If you withdraw before completing the study, your responses will not be used in the study.</p>
              <p>You have the right to request the withdrawal of your data after you have completed the study. You can make this request by contacting the Principal Investigator. This right exists up until the point the data is anonymized. This will occur after data collection for all participants is complete, at which point the link between your participant ID and your responses will be permanently destroyed. Once your data has been anonymized, we will be unable to identify and withdraw your specific responses from the dataset.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>10. What are your rights as a participant?</h4>
              <p>Your participation in this study is voluntary. You may decide not to be in this study. Even if you consent to participate and choose to leave the study at any time it will have no effect on your academic standing or standing with the research team. You do not waive any legal right by consenting to this study.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>11. Whom do you contact for questions?</h4>
              <p>If you have questions about this research study please contact one of the Principal Investigators named above through email.</p>
              <p>If you have any questions about your rights as a research participant or the conduct of this study, you may contact The Office of Human Research Ethics at ethics@uwo.ca. This office oversees the ethical conduct of research studies and is not part of the study team. Everything that you discuss will be kept confidential.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>12. Confirming Your Consent</h4>
              <p>You can save a copy of this information for your records.</p>
              <p>By clicking the 'I agree to participate' button below, you confirm that you have read and understood this consent form and that you voluntarily agree to participate in this study. If you do not wish to participate, please click the 'I do not wish to participate' button.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>13. Disclaimer of deception</h4>
              <p>During the survey you will be exposed to various messages. Some of these messages are generated by humans and some are generated by AI. As a participant, you will not receive any information about the source of the messages.</p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <h4>14. Funding</h4>
              <p>This research is funded in part by the Natural Sciences and Engineering Research Council of Canada (NSERC) through the Discovery Grants program.</p>
            </div>

          </div>
          
          <div className="navigation-with-quit landing-nav">
            <button 
              className="btn btn-primary" 
              onClick={async () => {
                if (!isInitializedRef.current) {
                  setStartTime(Date.now());
                  isInitializedRef.current = true;
                  await initializeSurvey();
                  setStep(1);
                } else {
                  setStep(1);
                }
              }}
              disabled={isLoading}
            >
              {isLoading ? 'Setting up survey...' : 'I agree to participate'}
            </button>
            <div className="quit-button-container">
              <button 
                className="btn btn-danger btn-small" 
                onClick={handleQuitStudy}
                disabled={isLoading}
              >
                I do not wish to participate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Page 2: First Table Survey (Quantitative)
  if(step===1 && quantitativeMessages.length) {
    return (
      <div className="survey-container slide-in">
        <div className="survey-card" style={{ maxWidth: '1600px', width: '98vw' }}>
          <div className="survey-header">
            <h2 className="survey-title" style={{ fontSize: '2rem' }}>Survey Table - Page 1</h2>
            <p className="survey-subtitle">Quantitative Evaluation: Rate each message across different dimensions</p>
          </div>
          
          <div className="survey-content">
            <div className="instructions">
              <h3>Instructions</h3>
              <p>Please evaluate all messages sent by trustees to trustors in a trust game setting. Use the table below to provide your quantitative responses for each message.</p>
            </div>

            <div className="survey-section">
              <h3 style={{ color: '#4f46e5', marginBottom: '1rem' }}>Game Rules</h3>
              <p>Trust games are common experimental games to study trust between individuals [1]. The game involves two players: a <strong>trustor (Player A)</strong> and a <strong>trustee (Player B)</strong>.</p>
              <p>The trustor makes the first move by choosing between two options: <strong>OUT</strong> or <strong>IN</strong>. If the trustor chooses <strong>OUT</strong>, the game ends immediately, and both players receive a modest, guaranteed payoff.</p>
              <p>If the trustor (player A) chooses <strong>IN</strong>, the trustee (player B) faces a decision: whether to <strong>ROLL</strong> or <strong>OUT</strong> a virtual dice.</p>
              <p>If the trustee (player B) chooses <strong>ROLL</strong>, there is a high probability (e.g., 5 out of 6) that both players will receive a relatively high payoff. However, there is also a small chance (e.g., 1 out of 6) that the trustee will receive a higher payoff while the trustor receives nothing.</p>
              <p>If the trustee (player B) chooses <strong>OUT</strong>, the trustee secures the high payoff for themselves with certainty, and the trustor receives nothing.</p>
              <p>The trustor (player A) will not know whether the trustee (player B) has rolled the dice, and the trustee (player B) knows that the trustor (player A) cannot observe this move. </p>
              <p>Before the trustor (player A) makes their decision, the trustee (player B) can send a one-time, free-form message to the trustor (player A). This message is non-binding and contains nothing that can be enforced.</p>

              <div className="diagram-container">
                <img 
                  src="/game_diag.png" 
                  alt="Trust Game Diagram" 
                />
              </div>
              <p>[1] Charness, Gary, and Martin Dufwenberg. "Promises and partnership." Econometrica 74.6 (2006): 1579-1601.</p>
            </div>

            <div className="survey-table-container">
              <table className="survey-table">
                <thead>
                  <tr>
                    <th className="message-header">Message</th>
                    <th className="header-with-info">
                      <div className="header-title">Commitment</div>
                      <div className="header-subtitle">Is the trustee making a commitment or promise to return money?</div>
                      <div className="definition-toggle">
                        <button 
                          className="toggle-definitions-btn"
                          onClick={() => toggleDefinitions('commitment')}
                          type="button"
                        >
                          {showDefinitions.commitment ? 'Hide definitions' : 'Show definitions'}
                        </button>
                      </div>
                      {showDefinitions.commitment && (
                        <div className="header-definitions">
                          <div className="definition-item">
                            <strong>Explicit Promise:</strong> The message indicates a return or cooperative action
                          </div>
                          <div className="definition-item">
                            <strong>Explicit 'No Promise':</strong> The message indicates a non-cooperative action
                          </div>
                          <div className="definition-item">
                            <strong>Implicit Suggestion:</strong> A hint or persuasive language implying trustworthy behavior
                          </div>
                          <div className="definition-item">
                            <strong>No Commitment:</strong> The message does not imply any commitment to any future action
                          </div>
                        </div>
                      )}
                    </th>
                    <th className="header-with-info">
                      <div className="header-title">Signaling (0-5)</div>
                      <div className="header-subtitle">Does the message signal a personal trait or characteristic of the trustee?</div>
                      <div className="definition-toggle">
                        <button 
                          className="toggle-definitions-btn"
                          onClick={() => toggleDefinitions('signaling')}
                          type="button"
                        >
                          {showDefinitions.signaling ? 'Hide scale' : 'Show scale'}
                        </button>
                      </div>
                      {showDefinitions.signaling && (
                        <div className="header-scale">
                          <span>0 = Not at all</span>
                          <span>5 = Very much</span>
                        </div>
                      )}
                    </th>
                    <th className="header-with-info">
                      <div className="header-title">Emotion</div>
                      <div className="header-subtitle">Does the message convey emotions?</div>
                      <div className="definition-toggle">
                        <button 
                          className="toggle-definitions-btn"
                          onClick={() => toggleDefinitions('emotion')}
                          type="button"
                        >
                          {showDefinitions.emotion ? 'Hide options' : 'Show options'}
                        </button>
                      </div>
                      {showDefinitions.emotion && (
                        <div className="header-options">
                          <span>Neutral • Negative • Positive</span>
                        </div>
                      )}
                    </th>
                    <th className="header-with-info">
                      <div className="header-title">Prediction (0-100%)</div>
                      <div className="header-subtitle">Imagine you received this message, how likely is it that the trustee who sent this message will choose ROLL?</div>
                      <div className="definition-toggle">
                        <button 
                          className="toggle-definitions-btn"
                          onClick={() => toggleDefinitions('prediction')}
                          type="button"
                        >
                          {showDefinitions.prediction ? 'Hide scale' : 'Show scale'}
                        </button>
                      </div>
                      {showDefinitions.prediction && (
                        <div className="header-scale">
                          <span>0% = Very unlikely</span>
                          <span>100% = Very likely</span>
                        </div>
                      )}
                    </th>
                    <th className="header-with-info">
                      <div className="header-title">Guilt Response (0-5)</div>
                      <div className="header-subtitle">Imagine you are the trustee, how guilty would you feel to choose OUT after sending this message?</div>
                      <div className="definition-toggle">
                        <button 
                          className="toggle-definitions-btn"
                          onClick={() => toggleDefinitions('guilt')}
                          type="button"
                        >
                          {showDefinitions.guilt ? 'Hide scale' : 'Show scale'}
                        </button>
                      </div>
                      {showDefinitions.guilt && (
                        <div className="header-scale">
                          <span>0 = Not guilty at all</span>
                          <span>5 = Very guilty</span>
                        </div>
                      )}
                    </th>
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

            <div className="navigation-with-quit">
              <div className="quit-button-container">
                <button 
                  className="btn btn-danger btn-small" 
                  onClick={handleQuitStudy}
                >
                  Quit Study
                </button>
              </div>
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
        <div className="survey-card" style={{ maxWidth: '1600px', width: '98vw' }}>
          <div className="survey-header">
            <h2 className="survey-title" style={{ fontSize: '2rem' }}>Survey Table - Page 2</h2>
            <p className="survey-subtitle">Qualitative Evaluation: Provide detailed responses for each message</p>
          </div>
          
          <div className="survey-content">
            <div className="instructions">
              <h3>Instructions</h3>
              <p>In this second part, we want to understand if and how communication can influence the trustor's decision to invest, but also the trustee's decision to roll the dice. We would like to understand your assessment of the qualities of the messages and the players' decisions. You will be shown messages sent in 3 to 4 selected games. Please answer, based on the information you have on each single game, the following questions with a short textual justification: </p>
            </div>

            <div className="diagram-container">
                <img 
                  src="/game_diag.png" 
                  alt="Trust Game Diagram" 
                />
              </div>

            <div className="survey-table-container">
              <table className="survey-table qualitative-table">
                <thead>
                  <tr>
                    <th className="message-header">Message</th>
                    <th className="qual-header-with-info">
                      <div className="qual-header-title">Trustee's Behavior</div>
                      <div className="qual-header-definition">Do you think the trustor forms expectations about the trustee's behavior? Why not or why, and if so: which expectations?</div>
                    </th>
                    <th className="qual-header-with-info">
                      <div className="qual-header-title">Trustor's Behavior</div>
                      <div className="qual-header-definition">Do you think the trustee expects that they will influence the trustor's anticipated behavior? Why not or why, and if so: how?</div>
                    </th>
                    <th className="qual-header-with-info">
                      <div className="qual-header-title">Guilt</div>
                      <div className="qual-header-definition">Do you find clues from the message and the decisions that the trustee would feel guilty if they choose OUT? Why not or why, and if so: Which aspects of their behavior reveal this?</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {qualitativeMessages.map((m, index) => (
                    <tr key={m.id}>
                      <td className="message-cell">
                        "{m.message}"
                      </td>
                      
                      {/* Trustee's Behavior Textarea */}
                      <td className="input-cell">
                        <div className={`textarea-container ${interactedInputs[`${m.id}_trusteeBehavior`] ? 'completed' : ''}`}>
                          <textarea 
                            className="form-textarea" 
                            rows={4} 
                            style={{ width: '100%', minWidth: '250px', fontSize: '0.875rem' }}
                            value={responses[m.id]?.trusteeBehavior || ''}
                            onChange={e=>handleChange(m.id,'trusteeBehavior',e.target.value)} 
                          />
                          {!interactedInputs[`${m.id}_trusteeBehavior`] && (
                            <div className="required-indicator">* Required</div>
                          )}
                        </div>
                      </td>
                      
                      {/* Trustor's Behavior Textarea */}
                      <td className="input-cell">
                        <div className={`textarea-container ${interactedInputs[`${m.id}_trustorBehavior`] ? 'completed' : ''}`}>
                          <textarea 
                            className="form-textarea" 
                            rows={4} 
                            style={{ width: '100%', minWidth: '250px', fontSize: '0.875rem' }}
                            value={responses[m.id]?.trustorBehavior || ''}
                            onChange={e=>handleChange(m.id,'trustorBehavior',e.target.value)} 
                          />
                          {!interactedInputs[`${m.id}_trustorBehavior`] && (
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
                            value={responses[m.id]?.guiltClues || ''}
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

            <div className="navigation-with-quit">
              <div className="quit-button-container">
                <button 
                  className="btn btn-danger btn-small" 
                  onClick={handleQuitStudy}
                >
                  Quit Study
                </button>
              </div>
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
               <p>Your anonymized data from this study will help advance our understanding of how language influences trust and cooperation.</p>
              {sessionId && (
                <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '1rem' }}>
                  Session ID: <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{sessionId}</code>
                </p>
              )}
            </div>
            <div style={{ marginTop: '2rem' }}>
              <p style={{ fontSize: '0.9rem', color: '#9ca3af', fontStyle: 'italic' }}>
                You can request that your data be deleted by contacting the research team at resource-economics@hu-berlin.de. The session id that is associated with your data will be deleted within one day of concluding data collection. If you have any questions about this research, please contact our research team through the institutions listed at the beginning of this survey.
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