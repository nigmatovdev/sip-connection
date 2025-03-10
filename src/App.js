import React, { useState, useRef } from 'react';
import { 
  UserAgent, 
  Registerer, 
  RegistererState, 
  SessionState 
} from 'sip.js';
import './App.css';

function App() {
  // Pre-populated SIP connection details (hidden by default)
  const [wssUrl] = useState('wss://moydom.bgsoft.uz/ws');
  const [sipExtension] = useState('104');
  const [username] = useState('104');
  const [password] = useState('12345678');
  const [registrationStatus, setRegistrationStatus] = useState('Not registered');

  // State to toggle connection details visibility
  const [showConnectionDetails, setShowConnectionDetails] = useState(false);

  // Call-related state
  const [destination, setDestination] = useState('');
  const [incomingCallInfo, setIncomingCallInfo] = useState('');
  const [isCallOngoing, setIsCallOngoing] = useState(false);
  const [localStream, setLocalStream] = useState(null);

  // Refs for SIP objects and media elements
  const sipRef = useRef({ userAgent: null, registerer: null });
  const currentSessionRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);

  // Handler to toggle the connection details panel
  const toggleConnectionDetails = () => {
    setShowConnectionDetails(prev => !prev);
  };

  // Connect/Registration handler using the new SIP.js API
  const handleConnect = () => {
    // Convert SIP URI string to a proper URI object.
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
      // Enable both audio and video
      sessionDescriptionHandlerFactoryOptions: {
        constraints: { audio: true, video: true }
      }
    };

    const userAgent = new UserAgent(config);
    // Use the delegate to handle incoming calls
    userAgent.delegate = {
      onInvite: (invitation) => {
        currentSessionRef.current = invitation;
        const fromURI = invitation.remoteIdentity.uri.toString();
        setIncomingCallInfo(`Incoming call from: ${fromURI}`);
      }
    };

    // Start the UA and register
    userAgent.start().then(() => {
      const registerer = new Registerer(userAgent);
      sipRef.current = { userAgent, registerer };

      // Listen for registration state changes
      registerer.stateChange.addListener((state) => {
        if (state === RegistererState.Registered) {
          setRegistrationStatus('Registered Successfully!');
        } else if (state === RegistererState.Unregistered) {
          setRegistrationStatus('Unregistered');
        } else if (state === RegistererState.Terminated) {
          setRegistrationStatus('Registration Terminated');
        }
      });
      registerer.register();
    }).catch((error) => {
      console.error("Failed to start UserAgent:", error);
      setRegistrationStatus(`Registration Failed: ${error.message}`);
    });
  };

  // Outgoing call handler
  const handleCall = () => {
    if (!sipRef.current.userAgent) {
      alert('Not connected yet!');
      return;
    }
    const targetURI = UserAgent.makeURI(`sip:${destination}@moydom.bgsoft.uz`);
    if (!targetURI) {
      alert('Invalid target URI!');
      return;
    }
    // Initiate an outgoing call with video
    const inviter = sipRef.current.userAgent.invite(targetURI.toString(), {
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: true } }
    });
    currentSessionRef.current = inviter;
    inviter.stateChange.addListener((state) => {
      if (state === SessionState.Established) {
        setIsCallOngoing(true);
        setupRemoteMedia(inviter);
      } else if (state === SessionState.Terminated) {
        endCall();
      }
    });
  };

  // Answer an incoming call
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

  // Decline an incoming call
  const handleDecline = () => {
    if (!currentSessionRef.current) return;
    currentSessionRef.current.reject();
    setIncomingCallInfo('Call declined');
    resetSession();
  };

  // Hang up an ongoing call
  const handleHangUp = () => {
    if (!currentSessionRef.current) return;
    const session = currentSessionRef.current;
    if (session.state === SessionState.Established) {
      session.bye();
    } else {
      session.reject();
    }
    endCall();
  };

  // Setup remote media by grabbing all receivers and attaching to remote video element
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

  // End call and cleanup
  const endCall = () => {
    setIncomingCallInfo('');
    setIsCallOngoing(false);
    resetSession();
  };

  const resetSession = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    currentSessionRef.current = null;
  };

  // Start local video preview by obtaining camera and mic stream
  const startLocalVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true; // Prevent feedback
      }
    } catch (error) {
      console.error("Failed to get local video:", error);
    }
  };

  return (
    <div className="container">
      <h1 className="header">SIP Client</h1>
      {/* Toggle Icon for Connection Details */}
      <div className="toggle-container">
        <button onClick={toggleConnectionDetails} className="icon-button">
          {showConnectionDetails ? 'Hide Connection Details ▲' : 'Show Connection Details ▼'}
        </button>
      </div>
      
      {/* Connection Panel (hidden by default) */}
      {showConnectionDetails && (
        <div className="panel">
          <h2>Connection Details</h2>
          <p><strong>WSS URL:</strong> {wssUrl}</p>
          <p><strong>SIP Extension:</strong> {sipExtension}</p>
          <p><strong>Username:</strong> {username}</p>
          <p><strong>Password:</strong> {password}</p>
          <button onClick={handleConnect} className="button">Connect</button>
          <p><strong>Status:</strong> {registrationStatus}</p>
        </div>
      )}
      
      {/* Call Controls Panel */}
      <div className="panel">
        <h2>Call Controls</h2>
        <div className="input-group">
          <label><strong>Destination:</strong></label>
          <input 
            type="text" 
            value={destination} 
            onChange={(e) => setDestination(e.target.value)} 
            placeholder="Enter extension or number" 
            className="input-field"
          />
          <button onClick={handleCall} className="button">Call</button>
          <button onClick={handleHangUp} className="button button-danger" disabled={!isCallOngoing}>Hang Up</button>
        </div>
        <h3>Incoming Call</h3>
        <p className="incoming-call">{incomingCallInfo}</p>
        <button onClick={handleAnswer} className="button" disabled={!incomingCallInfo}>Answer</button>
        <button onClick={handleDecline} className="button button-danger" disabled={!incomingCallInfo}>Decline</button>
      </div>
      
      {/* Video Streaming Panel */}
      <div className="panel">
        <h2>Video Streaming</h2>
        <div className="video-container">
          <div className="video-box">
            <h4>Local Video</h4>
            <video ref={localVideoRef} className="video" autoPlay playsInline />
            <button onClick={startLocalVideo} className="button">Start Local Preview</button>
          </div>
          <div className="video-box">
            <h4>Remote Video</h4>
            <video ref={remoteVideoRef} className="video" autoPlay playsInline />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
