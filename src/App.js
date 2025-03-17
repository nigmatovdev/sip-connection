import React, { useEffect, useRef, useState } from 'react';
import { 
  UserAgent, 
  Registerer, 
  RegistererState, 
  SessionState 
} from 'sip.js';
import './App.css';

function App() {
  // SIP connection details
  const [wssUrl] = useState('wss://moydom.bgsoft.uz/ws');
  const [sipExtension] = useState('104');
  const [username] = useState('104');
  const [password] = useState('12345678');
  const [registrationStatus, setRegistrationStatus] = useState('Connecting...');

  // Call-related state
  const [incomingCallInfo, setIncomingCallInfo] = useState('');
  const [isCallOngoing, setIsCallOngoing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Refs for SIP objects and media elements
  const sipRef = useRef({ userAgent: null, registerer: null });
  const currentSessionRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Auto-connect on component mount
  useEffect(() => {
    handleConnect();
    return () => {
      // Cleanup on unmount
      if (sipRef.current.userAgent) {
        sipRef.current.userAgent.stop();
      }
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
      }
    };

    userAgent.start().then(() => {
      const registerer = new Registerer(userAgent);
      sipRef.current = { userAgent, registerer };

      registerer.stateChange.addListener((state) => {
        switch (state) {
          case RegistererState.Registered:
            setRegistrationStatus('Ready to receive calls');
            break;
          case RegistererState.Unregistered:
            setRegistrationStatus('Disconnected');
            break;
          case RegistererState.Terminated:
            setRegistrationStatus('Connection terminated');
            break;
          default:
            break;
        }
      });
      registerer.register();
    }).catch((error) => {
      console.error("Connection failed:", error);
      setRegistrationStatus(`Connection Failed: ${error.message}`);
    });
  };

  const handleAnswer = () => {
    if (!currentSessionRef.current) return;
    const invitation = currentSessionRef.current;
    invitation.accept({
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: true } }
    });
    invitation.stateChange.addListener((state) => {
      if (state === SessionState.Established) {
        setIsCallOngoing(true);
        setupRemoteMedia(invitation);
        setIncomingCallInfo('Call in progress...');
      } else if (state === SessionState.Terminated) {
        endCall();
      }
    });
  };

  const handleDecline = () => {
    if (!currentSessionRef.current) return;
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
    // Implement door opening logic here
    // This could be an API call to your door system
    alert('Door opening command sent!');
  };

  const endCall = () => {
    setIncomingCallInfo('');
    setIsCallOngoing(false);
    setIsMuted(false);
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
        <span className={`status-indicator ${registrationStatus.includes('Ready') ? 'connected' : ''}`}></span>
        {registrationStatus}
      </div>

      <div className="video-panel">
        <video ref={remoteVideoRef} className="remote-video" autoPlay playsInline />
        
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