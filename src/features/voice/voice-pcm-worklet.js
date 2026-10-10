class ErpVoicePcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      if (event.data?.kind === "flush") this.port.postMessage({kind: "flushed"});
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel?.length) {
      const copy = channel.slice();
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}

registerProcessor("erp-voice-pcm-capture", ErpVoicePcmCapture);
