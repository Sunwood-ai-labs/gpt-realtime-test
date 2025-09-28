(function () {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusEl = document.getElementById('status');
  const logEl = document.getElementById('log');
  const audioEl = document.getElementById('remoteAudio');
  const micStatusEl = document.getElementById('micStatus');
  const dataChannelStatusEl = document.getElementById('dataChannelStatus');
  const connectionStateEl = document.getElementById('connectionState');
  const statusDot = document.getElementById('statusDot');
  const statusPulse = document.getElementById('statusPulse');
  const clearLogBtn = document.getElementById('clearLog');
  const copyLogBtn = document.getElementById('copyLog');
  const muteToggleBtn = document.getElementById('muteToggle');
  const muteLabel = document.getElementById('muteLabel');
  const systemPromptEl = document.getElementById('systemPrompt');
  const voiceSelect = document.getElementById('voiceSelect');

  let pc = null;
  let localStream = null;
  let dc = null;

  function log(...args) {
    const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}\n`;
    logEl.textContent += line;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setStatus(text, tone = 'idle') {
    statusEl.textContent = text;
    const colorMap = {
      idle: 'bg-rose-400',
      loading: 'bg-amber-300',
      ready: 'bg-emerald-300'
    };
    ['bg-rose-400', 'bg-amber-300', 'bg-emerald-300'].forEach((cls) => {
      statusDot.classList.remove(cls);
      statusPulse.classList.remove(cls);
    });
    const color = colorMap[tone] || 'bg-rose-400';
    statusDot.classList.add(color);
    statusPulse.classList.add(color);
    log(text);
  }

  async function startSession() {
    startBtn.disabled = true;
    setStatus('Requesting ephemeral token...', 'loading');

    try {
      const systemPrompt = systemPromptEl ? systemPromptEl.value.trim() : '';
      if (systemPrompt) {
        log('Using custom system prompt (' + systemPrompt.length + ' chars)');
      }
      const selectedVoice = voiceSelect ? voiceSelect.value : '';
      if (selectedVoice) {
        log('Requesting voice: ' + selectedVoice);
      }

      const tokenResp = await fetch('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, voice: selectedVoice })
      });
      if (!tokenResp.ok) throw new Error('Failed to fetch /token');
      const tokenData = await tokenResp.json();
      const EPHEMERAL_KEY =
        tokenData?.value ||
        tokenData?.client_secret?.value ||
        tokenData?.client_secret?.secret ||
        tokenData?.client_secret;
      if (!EPHEMERAL_KEY) {
        throw new Error('Ephemeral key not found in /token response');
      }
      log('Ephemeral key received');

      setStatus('Acquiring microphone...', 'loading');
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      micStatusEl.textContent = '取得済み';

      setStatus('Creating RTCPeerConnection...', 'loading');
      pc = new RTCPeerConnection();

      pc.ontrack = (event) => {
        log('Received remote track');
        audioEl.srcObject = event.streams[0];
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        connectionStateEl.textContent = state;
        log('Connection state: ' + state);
        if (state === 'connected') setStatus('Connected', 'ready');
        if (state === 'failed' || state === 'disconnected') setStatus('Connection lost', 'idle');
      };

      pc.oniceconnectionstatechange = () => {
        log('ICE state: ' + pc.iceConnectionState);
      };

      pc.ondatachannel = (event) => {
        const ch = event.channel;
        dataChannelStatusEl.textContent = 'ON (' + ch.label + ')';
        ch.onmessage = (message) => log('Data channel message:', message.data);
      };

      const track = localStream.getAudioTracks()[0];
      if (track) pc.addTrack(track, localStream);

      dc = pc.createDataChannel('oai-events');
      dataChannelStatusEl.textContent = '初期化中';
      dc.onopen = () => {
        dataChannelStatusEl.textContent = 'ON (oai-events)';
        log('Data channel opened');
      };
      dc.onclose = () => {
        dataChannelStatusEl.textContent = 'OFF';
        log('Data channel closed');
      };
      dc.onmessage = (message) => log('Event:', message.data);

      setStatus('Creating offer...', 'loading');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setStatus('Sending SDP to realtime backend...', 'loading');
      const baseUrl = 'https://api.openai.com/v1/realtime/calls';
      const model = 'gpt-realtime';

      const sdpResp = await fetch(`${baseUrl}?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp'
        }
      });

      if (!sdpResp.ok) throw new Error('Realtime backend returned HTTP ' + sdpResp.status);

      const answerSdp = await sdpResp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setStatus('Connected', 'ready');
      stopBtn.disabled = false;
      log('Session started successfully');
    } catch (error) {
      log('Error:', error && error.message ? error.message : error);
      setStatus('Error: ' + (error && error.message ? error.message : 'unknown'), 'idle');
      startBtn.disabled = false;
      micStatusEl.textContent = '未取得';
      dataChannelStatusEl.textContent = '未接続';
    }
  }

  function stopSession() {
    setStatus('Stopping session...', 'loading');
    if (pc) {
      try {
        pc.close();
      } catch (error) {
        /* ignore */
      }
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    if (dc) {
      try {
        dc.close();
      } catch (error) {
        /* ignore */
      }
      dc = null;
    }
    stopBtn.disabled = true;
    startBtn.disabled = false;
    setStatus('Stopped', 'idle');
    connectionStateEl.textContent = '---';
    dataChannelStatusEl.textContent = '未接続';
    micStatusEl.textContent = '未取得';
  }

  clearLogBtn?.addEventListener('click', () => {
    logEl.textContent = '';
    log('Log cleared by operator');
  });

  copyLogBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(logEl.textContent || '');
      log('Copied log to clipboard');
    } catch (error) {
      log('Failed to copy log: ' + error);
    }
  });

  voiceSelect?.addEventListener('change', () => {
    log('Voice selected: ' + voiceSelect.value);
  });

  muteToggleBtn?.addEventListener('click', () => {
    const isMuted = (audioEl.muted = !audioEl.muted);
    muteToggleBtn.setAttribute('aria-pressed', String(isMuted));
    const icon = muteToggleBtn.querySelector('i');
    if (icon) icon.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    if (muteLabel) muteLabel.textContent = isMuted ? 'ミュート解除' : 'ミュート';
  });

  startBtn.addEventListener('click', startSession);
  stopBtn.addEventListener('click', stopSession);
})();
