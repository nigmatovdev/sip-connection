import React, { useState, useRef } from 'react';
import { 
  UserAgent, 
  Registerer, 
  RegistererState, 
  SessionState 
} from 'sip.js';

function App() {
  // Pre-populated SIP connection details
  const [wssUrl] = useState('wss://moydom.bgsoft.uz/ws');
  const [sipExtension] = useState('104');
  const [username] = useState('104');
  const [password] = useState('12345678');
  const [registrationStatus, setRegistrationStatus] = useState('Not registered');

  // Call-related state
  const [destination, setDestination] = useState('');
  const [incomingCallInfo, setIncomingCallInfo] = useState('');
  const [isCallOngoing, setIsCallOngoing] = useState(false);

  // Refs for SIP objects
  // We store both the userAgent and registerer together
  const sipRef = useRef({ userAgent: null, registerer: null });
  // Current call session (for outgoing or incoming call)
  const currentSessionRef = useRef(null);
  // Ref for the audio element to play remote audio
  const remoteAudioRef = useRef(null);

  // Connect/Registration handler using the new API
  const handleConnect = () => {
    // Convert our SIP URI string into a URI object
    const targetUri = UserAgent.makeURI(`sip:${sipExtension}@moydom.bgsoft.uz`);
    if (!targetUri) {
      setRegistrationStatus('Invalid SIP URI');
      return;
    }
    
    const config = {
      uri: targetUri,
      authorizationUsername: username,
      authorizationPassword: password,
      transportOptions: {
        wsServers: [wssUrl]
      },
      sessionDescriptionHandlerFactoryOptions: {
        constraints: { audio: true, video: false }
      }
    };

    // Create the UserAgent
    const userAgent = new UserAgent(config);

    // Set delegate to handle incoming calls
    userAgent.delegate = {
      onInvite: (invitation) => {
        currentSessionRef.current = invitation;
        const fromURI = invitation.remoteIdentity.uri.toString();
        setIncomingCallInfo(`Incoming call from: ${fromURI}`);
      }
    };

    // Start the UserAgent and then register
    userAgent.start().then(() => {
      const registerer = new Registerer(userAgent);
      // Save both for later use
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
    // Create target SIP URI using the provided destination
    const targetURI = UserAgent.makeURI(`sip:${destination}@moydom.bgsoft.uz`);
    if (!targetURI) {
      alert('Invalid target URI!');
      return;
    }
    // Use userAgent.invite to create an outgoing call (Inviter)
    const inviter = sipRef.current.userAgent.invite(targetURI.toString(), {
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false }
      }
    });
    currentSessionRef.current = inviter;

    // Listen for call state changes (e.g., established, terminated)
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
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false }
      }
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

  // Attach incoming audio stream to the audio element
  const setupRemoteMedia = (session) => {
    const sdh = session.sessionDescriptionHandler;
    if (!sdh) return;
    sdh.on('addTrack', (event) => {
      const remoteStream = new MediaStream();
      remoteStream.addTrack(event.track);
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
    });
  };

  // End call and cleanup
  const endCall = () => {
    setIncomingCallInfo('');
    setIsCallOngoing(false);
    resetSession();
  };

  const resetSession = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    currentSessionRef.current = null;
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>React SIP Client</h1>

      {/* Connection Panel – SIP details are preinserted */}
      <div style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '20px' }}>
        <h2>Connection Details</h2>
        <p><strong>WSS URL:</strong> {wssUrl}</p>
        <p><strong>SIP Extension:</strong> {sipExtension}</p>
        <p><strong>Username:</strong> {username}</p>
        <p><strong>Password:</strong> {password}</p>
        <button onClick={handleConnect}>Connect</button>
        <p><strong>Status:</strong> {registrationStatus}</p>
      </div>

      {/* Call Controls Panel */}
      <div style={{ border: '1px solid #ccc', padding: '10px' }}>
        <h2>Call Controls</h2>
        <div>
          <label><strong>Destination:</strong></label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Enter extension or number"
            style={{ marginLeft: '10px' }}
          />
          <button onClick={handleCall} style={{ marginLeft: '10px' }}>
            Call
          </button>
          <button onClick={handleHangUp} style={{ marginLeft: '10px' }} disabled={!isCallOngoing}>
            Hang Up
          </button>
        </div>

        <h3>Incoming Call</h3>
        <p style={{ fontWeight: 'bold' }}>{incomingCallInfo}</p>
        <button onClick={handleAnswer} disabled={!incomingCallInfo}>
          Answer
        </button>
        <button onClick={handleDecline} disabled={!incomingCallInfo} style={{ marginLeft: '10px' }}>
          Decline
        </button>

        {/* Audio element for remote audio */}
        <h3>Remote Audio</h3>
        <audio ref={remoteAudioRef} autoPlay />
      </div>
    </div>
  );
}

export default App;
