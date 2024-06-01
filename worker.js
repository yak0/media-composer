const canvas = new OffscreenCanvas(1, 1);
const ctx = canvas.getContext("2d");
const abortController = new AbortController();

let config = {
  size: 250,
  margin: 20,
  position: 'bottom-left', // top-left, top-right, bottom-left, bottom-right
}

const calculateAvatarPosition = (width, height) => {
  let dx,dy;
  switch(config.position) {
    case 'top-left':
      dx = config.margin;
      dy = config.margin;
      break;
    case 'top-right':
      dx = width - (config.size + config.margin);
      dy = config.margin;
      break;
    case 'bottom-right':
      dx = width - (config.size + config.margin);
      dy = height - (config.size + config.margin);
      break;
    case 'bottom-left':
      dx = config.margin;
      dy = height - (config.size + config.margin);
      break;
    default:
      dx = config.margin;
      dy = height - (config.size + config.margin);
      break;
  }

  return { dx, dy };
}

const compose = (cameraReadableStream, screenReadableStream, sink) => {
  const screenReader = screenReadableStream.getReader();
  const { signal } = abortController
  let screenFrame;

  const transformer = new TransformStream({
    async transform(cameraFrame, controller) {
      screenReader.read().then(frame => {
        if (screenFrame) {
          screenFrame.close();
        }
        screenFrame = frame.value;
      });

      if (screenFrame && screenFrame?.displayWidth > 0) {
        canvas.width = screenFrame.displayWidth
        canvas.height = screenFrame.displayHeight;
        ctx.drawImage(screenFrame, 0, 0, canvas.width, canvas.height);

        const radius = config.size / 2;

        const ss = Math.min(cameraFrame.displayWidth, cameraFrame.displayHeight);
        const sx = (cameraFrame.displayWidth - ss) / 2;
        const sy = (cameraFrame.displayHeight - ss) / 2;
        const { dx, dy } = calculateAvatarPosition(canvas.width, canvas.height);

        ctx.beginPath();
        ctx.arc(dx + radius, dy + radius, radius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(cameraFrame, sx, sy, ss, ss, dx, dy, config.size, config.size);

        const newFrame = new VideoFrame(canvas, {
          timestamp: cameraFrame.timestamp,
        });
        cameraFrame.close();
        controller.enqueue(newFrame);
      } else {
        controller.enqueue(cameraFrame);
      }
    }
  })

  cameraReadableStream.pipeThrough(transformer, { signal }).pipeTo(sink);
}

onmessage = async (event) => {
  const { operation } = event.data;
  switch (operation) {
    case 'compose':
      const { cameraReadableStream, screenReadableStream, sink } = event.data;
      compose(cameraReadableStream, screenReadableStream, sink);
      break;
    case 'stop':
      abortController.abort();
      break;
    case 'config':
      config = { ...config, ...event.data};
      break;
  }
}
