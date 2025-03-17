import React, { useEffect, useRef, useState } from 'react';
import { 
  UserAgent, 
  Registerer, 
  RegistererState, 
  SessionState 
} from 'sip.js';
import ringtoneSound from './assets/ringtone.mp3';
import './App.css';

function App() {
  // SIP connection details
  const [wssUrl] = useState('wss://moydom.bgsoft.uz/ws');
  const [sipExtension] = useState('104');
  const [username] = useState('104');
  const [password] = useState('12345678');
  const [registrationStatus, setRegistrationStatus] = useState('Connecting...');
  const [showReadyScreen, setShowReadyScreen] = useState(true);

  // Call-related state
  const [incomingCallInfo, setIncomingCallInfo] = useState('');
  const [isCallOngoing, setIsCallOngoing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Refs for SIP objects and media elements
  const sipRef = useRef({ userAgent: null, registerer: null });
  const currentSessionRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const ringToneRef = useRef(new Audio(ringtoneSound));

  // Auto-connect on mount
  useEffect(() => {
    handleConnect();
    ringToneRef.current.loop = true;
    
    return () => {
      if (sipRef.current.userAgent) {
        sipRef.current.userAgent.stop();
      }
      ringToneRef.current.pause();
      ringToneRef.current.currentTime = 0;
    };
  }, []);

  const handleConnect = () => {
    const targetUri = UserAgent.makeURI(`sip:${sipExtension}@moydom.bgsoft.uz`);
    if (!targetUri) {
      setRegistrationStatus('Invalid SIP URI');
      return;
    }

    const config = {
      uri: targetUri,
      authorizationUsername: username,
      authorizationPassword: password,
      transportOptions: { wsServers: [wssUrl] },
      sessionDescriptionHandlerFactoryOptions: {
        constraints: { audio: true, video: true }
      }
    };

    const userAgent = new UserAgent(config);
    userAgent.delegate = {
      onInvite: (invitation) => {
        currentSessionRef.current = invitation;
        const fromURI = invitation.remoteIdentity.uri.toString();
        setIncomingCallInfo(`Incoming call from: ${fromURI}`);
        setShowReadyScreen(false);
        ringToneRef.current.play();
      }
    };

    userAgent.start().then(() => {
      const registerer = new Registerer(userAgent);
      sipRef.current = { userAgent, registerer };

      registerer.stateChange.addListener((state) => {
        switch (state) {
          case RegistererState.Registered:
            setRegistrationStatus('Ready to receive calls');
            setShowReadyScreen(true);
            break;
          case RegistererState.Unregistered:
            setRegistrationStatus('Disconnected');
            setShowReadyScreen(false);
            break;
          case RegistererState.Terminated:
            setRegistrationStatus('Connection terminated');
            setShowReadyScreen(false);
            break;
          default:
            break;
        }
      });
      registerer.register();
    }).catch((error) => {
      console.error("Connection failed:", error);
      setRegistrationStatus(`Connection Failed: ${error.message}`);
      setShowReadyScreen(false);
    });
  };

  const handleAnswer = () => {
    if (!currentSessionRef.current) return;
    // Pause ringtone immediately.
    ringToneRef.current.pause();
    ringToneRef.current.currentTime = 0;

    const invitation = currentSessionRef.current;
    // Add state-change listener BEFORE calling accept.
    invitation.stateChange.addListener((state) => {
      console.log("Invitation state changed:", state);
      if (state === SessionState.Established) {
        setIsCallOngoing(true);
        setupRemoteMedia(invitation);
        setIncomingCallInfo('Call in progress...');
      } else if (state === SessionState.Terminated) {
        endCall();
      }
    });
    invitation.accept({
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: true } }
    });
  };

  const handleDecline = () => {
    if (!currentSessionRef.current) return;
    ringToneRef.current.pause();
    ringToneRef.current.currentTime = 0;
    
    const session = currentSessionRef.current;
    if (session.state === SessionState.InviteReceived) {
      session.reject();
      setIncomingCallInfo('Call declined');
    } else if (session.state === SessionState.Established) {
      session.bye();
      setIncomingCallInfo('Call ended');
    }
    resetSession();
  };

  const setupRemoteMedia = (session) => {
    const pc = session.sessionDescriptionHandler.peerConnection;
    const remoteStream = new MediaStream();
    pc.getReceivers().forEach(receiver => {
      if (receiver.track) remoteStream.addTrack(receiver.track);
    });
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  };

  const toggleMute = () => {
    if (!currentSessionRef.current) return;
    
    const session = currentSessionRef.current;
    const pc = session.sessionDescriptionHandler.peerConnection;
    pc.getSenders().forEach(sender => {
      if (sender.track && sender.track.kind === 'audio') {
        sender.track.enabled = isMuted;
      }
    });
    setIsMuted(!isMuted);
  };

  const handleOpenDoor = () => {
    alert('Door opening command sent!');
  };

  const endCall = () => {
    setIncomingCallInfo('');
    setIsCallOngoing(false);
    setIsMuted(false);
    setShowReadyScreen(true);
    resetSession();
  };

  const resetSession = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    currentSessionRef.current = null;
  };

  return (
    <div className="container">
      <div className="status-bar">
        <div className="status-content">
          <span className={`status-indicator ${registrationStatus.includes('Ready') ? 'connected' : ''}`}></span>
          <div className="status-text">
            <span className="status-icon">📞</span>
            <span className="status-label">{registrationStatus}</span>
            <span className="status-extension">Extension: {sipExtension}</span>
          </div>
        </div>
      </div>

      <div className="video-panel">
        {showReadyScreen && registrationStatus.includes('Ready') ? (
          <div className="ready-screen">
            <div className="ready-content">
              <div className="ready-icon">📞</div>
              <h1>Ready to Receive Calls</h1>
              <p>Extension: {sipExtension}</p>
              <div className="pulse-ring"></div>
            </div>
          </div>
        ) : (
          <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
        )}
        
        {isCallOngoing && (
          <div className="call-controls">
            <button onClick={toggleMute} className={`control-button ${isMuted ? 'muted' : ''}`}>
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={handleOpenDoor} className="control-button door-button">
              Open Door
            </button>
            <button onClick={handleDecline} className="control-button end-call">
              End Call
            </button>
          </div>
        )}
      </div>

      {incomingCallInfo && !isCallOngoing && (
        <div className="incoming-call-panel">
          <p className="incoming-call">{incomingCallInfo}</p>
          <div className="answer-controls">
            <button onClick={handleAnswer} className="answer-button">Answer</button>
            <button onClick={handleDecline} className="decline-button">Decline</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
