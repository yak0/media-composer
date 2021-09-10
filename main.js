const cameraVideo = document.getElementById('camera');
const screenVideo = document.getElementById('screen');
const remoteVideo = document.getElementById('remote');
const stopButton = document.getElementById('stop');
const startButton = document.getElementById('start');

let cameraStream, screenStream, localPeer, remotePeer, worker;

const mixAudioStreams = (streams) => {
  const audioContext = new AudioContext();
  const gainNode = audioContext.createGain();
  const audioDestination = audioContext.createMediaStreamDestination();
  gainNode.connect(audioContext.destination);
  gainNode.gain.value = 0;
  streams.forEach(stream => {
    const audioSource = audioContext.createMediaStreamSource(stream);
    audioSource.connect(gainNode);
    audioSource.connect(audioDestination);
  });

  return audioDestination.stream;
}

const start = async () => {
  if(!('MediaStreamTrackProcessor' in window)){
    alert('Cannot find MediaStreamTrackProcessor. Enable experimental features');
    return;
  }
  worker = new Worker('./worker.js');
  // get camera stream
	cameraStream = await navigator.mediaDevices.getUserMedia({ video:true, audio: true });
  const [cameraTrack] = cameraStream.getVideoTracks();
  const { readable: cameraReadableStream } = new MediaStreamTrackProcessor({ track: cameraTrack });
  cameraVideo.srcObject = cameraStream;

  // get screen stream
  screenStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
  const [screenTrack] = screenStream.getVideoTracks();
  const { readable: screenReadableStream } = new MediaStreamTrackProcessor({ track: screenTrack });
  screenVideo.srcObject = screenStream;

  // create a generator 
  const composedTrackGenerator = new MediaStreamTrackGenerator({ kind: 'video' });
  const sink = composedTrackGenerator.writable;

  worker.postMessage({
    operation: 'compose',
    cameraReadableStream,
    screenReadableStream,
    sink,
  }, [
    cameraReadableStream,
    screenReadableStream,
    sink,
  ]);

  let audioTrack;
  // mix audio streams if screen has one
  if(screenStream.getAudioTracks().length > 0) {
    const mixedAudioStream = mixAudioStreams([cameraStream, screenStream]);
    audioTrack = mixedAudioStream.getAudioTracks()[0];
  } else {
    audioTrack = cameraStream.getAudioTracks()[0];
  }
  
  // initialize peer connections
  localPeer = new RTCPeerConnection();
  remotePeer = new RTCPeerConnection();
  localPeer.onicecandidate = ({ candidate }) => remotePeer.addIceCandidate(candidate);
  remotePeer.onicecandidate = ({ candidate }) => localPeer.addIceCandidate(candidate);
  localPeer.onnegotiationneeded = async () => {
    const offer = await localPeer.createOffer();
    await localPeer.setLocalDescription(offer);
    await remotePeer.setRemoteDescription(offer);

    const answer = await remotePeer.createAnswer();
    await remotePeer.setLocalDescription(answer);
    await localPeer.setRemoteDescription(answer);
  };

  //
  const composedStream = new MediaStream();
  composedStream.addTrack(composedTrackGenerator);
  composedStream.addTrack(audioTrack);
  composedStream.getTracks().forEach(track => localPeer.addTrack(track, composedStream));

  remotePeer.ontrack = (event) => {
    const [stream] = event.streams;
    remoteVideo.srcObject = stream;
    remoteVideo.play();
  };

  startButton.style.display = "none";
  stopButton.style.display = "block";
}

const stop = () => {
  worker.postMessage({
    operation: 'stop'
  });
  if(remotePeer) {
    remotePeer.close();
  }
  if(localPeer) {
    localPeer.close();
  }
  if(cameraStream) {
    cameraStream.getTracks().forEach(function(track) {
      track.stop();
    });
  }
  if(screenStream) {
    screenStream.getTracks().forEach(function(track) {
      track.stop();
    });
  }
  if(worker){
    worker.terminate();
  }

  startButton.style.display = "block";
  stopButton.style.display = "none";
}