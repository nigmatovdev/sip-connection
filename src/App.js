import React, { useState, useRef } from 'react';
import { UserAgent, SessionState } from 'sip.js';

function App() {
  // ---------- State for Registration ----------
  const [wssUrl, setWssUrl] = useState('wss://moydom.bgsoft.uz/ws');
  const [sipExtension, setSipExtension] = useState('104');
  const [username, setUsername] = useState('104');
  const [password, setPassword] = useState('12345678');
  const [registrationStatus, setRegistrationStatus] = useState('Not registered');

  // ---------- State for Calls ----------
  const [destination, setDestination] = useState('');
  const [incomingCallInfo, setIncomingCallInfo] = useState('');
  const [isCallOngoing, setIsCallOngoing] = useState(false);

  // ---------- Refs to store SIP.js objects and session ----------
  const userAgentRef = useRef(null);
  const currentSessionRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // ========== REGISTER HANDLER ==========
  const handleRegister = () => {
    // 1) Create a new SIP.js UserAgent configuration
    const config = {
      uri: `sip:${sipExtension}@moydom.bgsoft.uz`,
      authorizationUsername: username,
      authorizationPassword: password,
      transportOptions: {
        wsServers: [wssUrl],
      },
      // Audio-only
      sessionDescriptionHandlerFactoryOptions: {
        constraints: { audio: true, video: false },
      },
    };

    // 2) Instantiate the UserAgent
    userAgentRef.current = new UserAgent(config);

    // 3) Setup event listeners
    userAgentRef.current.on('registered', () => {
      setRegistrationStatus('Registered Successfully!');
    });

    userAgentRef.current.on('registrationFailed', (error) => {
      setRegistrationStatus(`Registration Failed: ${error}`);
    });

    // Handle incoming calls
    userAgentRef.current.on('invite', (incomingSession) => {
      currentSessionRef.current = incomingSession;
      const fromURI = incomingSession.remoteIdentity.uri.toString();
      setIncomingCallInfo(`Incoming call from: ${fromURI}`);
    });

    // 4) Start the UserAgent (this triggers the registration process)
    userAgentRef.current.start();
  };

  // ========== CALL HANDLER (OUTGOING) ==========
  const handleCall = () => {
    if (!userAgentRef.current) {
      alert('Not registered yet!');
      return;
    }

    // Create a new outgoing session
    const targetURI = `sip:${destination}@moydom.bgsoft.uz`;
    const session = userAgentRef.current.invite(targetURI, {
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false },
      },
    });
    currentSessionRef.current = session;

    // When the call is accepted/established
    session.on('accepted', () => {
      setIsCallOngoing(true);
      setupRemoteMedia(session);
    });

    // When the remote party hangs up or the call ends
    session.on('bye', endCall);
    session.on('terminated', endCall);
  };

  // ========== ANSWER HANDLER (INCOMING) ==========
  const handleAnswer = () => {
    if (!currentSessionRef.current) return;

    currentSessionRef.current.accept({
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false },
      },
    });

    currentSessionRef.current.on('accepted', () => {
      setIsCallOngoing(true);
      setupRemoteMedia(currentSessionRef.current);
      setIncomingCallInfo('Call in progress...');
    });

    currentSessionRef.current.on('bye', endCall);
    currentSessionRef.current.on('terminated', endCall);
  };

  // ========== DECLINE HANDLER (INCOMING) ==========
  const handleDecline = () => {
    if (!currentSessionRef.current) return;
    currentSessionRef.current.reject();
    setIncomingCallInfo('Call declined');
    resetSession();
  };

  // ========== HANGUP HANDLER ==========
  const handleHangUp = () => {
    if (!currentSessionRef.current) return;

    const session = currentSessionRef.current;
    if (session.state === SessionState.Established) {
      session.bye();
    } else if (session.state === SessionState.Initial || session.state === SessionState.InviteReceived) {
      session.reject();
    }
    endCall();
  };

  // ========== SETUP REMOTE MEDIA ==========
  // Attach incoming audio stream to <audio> element
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

  // ========== END CALL / CLEANUP ==========
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

  // ------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------
  return (
    <div style={{ padding: '20px' }}>
      <h1>React SIP Client</h1>

      {/* ========== Registration Panel ========== */}
      <div style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '20px' }}>
        <h2>Registration</h2>
        <div>
          <label><strong>WSS URL:</strong></label>
          <input
            type="text"
            value={wssUrl}
            onChange={(e) => setWssUrl(e.target.value)}
            style={{ width: '300px', marginLeft: '10px' }}
          />
        </div>
        <div>
          <label><strong>SIP Extension:</strong></label>
          <input
            type="text"
            value={sipExtension}
            onChange={(e) => setSipExtension(e.target.value)}
            style={{ marginLeft: '10px' }}
          />
        </div>
        <div>
          <label><strong>Username:</strong></label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ marginLeft: '10px' }}
          />
        </div>
        <div>
          <label><strong>Password:</strong></label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginLeft: '10px' }}
          />
        </div>
        <button onClick={handleRegister} style={{ marginTop: '10px' }}>
          Register
        </button>
        <p><strong>Status:</strong> {registrationStatus}</p>
      </div>

      {/* ========== Call Panel ========== */}
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

        {/* Audio element to play remote stream */}
        <h3>Remote Audio</h3>
        <audio ref={remoteAudioRef} autoPlay />
      </div>
    </div>
  );
}

export default App;
