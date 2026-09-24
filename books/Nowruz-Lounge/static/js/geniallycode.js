/**
 *
 * This is a local copy of the geniallyCode.js script that allows
 * communication between the Genially and the iframe.
 *
 * If any changes are made to this file, it should be
 * manually re-uploaded to https://static.genially.com/geniallycode.js
 *
 */
(() => {
  /**
   * Copied by hand from `ui/src/constants/PresentationRecordingWidgetMessages.ts`, which is where
   * this protocol is defined. This file ships as a plain script with no bundler and cannot import
   * anything, so every literal below has to match that file character for character and nothing
   * checks that it does.
   */
  const RECORDING_PROTOCOL_VERSION = 1;
  const RECORDING_ARM = 'PRESENTATION_RECORDING_WIDGET_ARM';
  const RECORDING_PAUSE = 'PRESENTATION_RECORDING_WIDGET_PAUSE';
  const RECORDING_RESUME = 'PRESENTATION_RECORDING_WIDGET_RESUME';
  const RECORDING_STOP = 'PRESENTATION_RECORDING_WIDGET_STOP';
  const RECORDING_CLIP_EVENTS = 'PRESENTATION_RECORDING_WIDGET_CLIP_EVENTS';

  /**
   * Resolved against this script's own URL instead of written out whole, so the bundle is always
   * fetched from wherever this file was served from. The path after the origin is deliberately
   * the same everywhere for that to work.
   */
  const RECORDER_BUNDLE_PATH = 'vendor/rrweb-record-2.1.1.min.js';

  /**
   * Copied by hand from `packages/view-scripts/src/genially/geniallyCode/widgetAudioMessages.ts`,
   * with the same caveat as above: nothing checks that the two files still agree.
   */
  const WIDGET_AUDIO_PRESENCE = 'audioPresence';
  const WIDGET_AUDIO_MUTE_STATE = 'audioMuteState';

  /**
   * The retry control the code generator tags, and the `<html>` attribute that hides every one of
   * them at once. The generator is told to put the tag on the element whose disappearance leaves
   * no orphans, so hiding is a single CSS rule and never a DOM edit: a widget document is user
   * code and the host must not restructure it.
   */
  const RETRY_CONTROL_ATTRIBUTE = 'data-genially-retry';
  const RETRY_HIDDEN_ATTRIBUTE = 'data-genially-retry-hidden';

  const findPropertyDescriptor = (target, propertyName) => {
    let prototype = target;

    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);

      if (descriptor) {
        return descriptor;
      }

      prototype = Object.getPrototypeOf(prototype);
    }

    return null;
  };

  class Genially {
    constructor() {
      this.handlers = {};
      this._config = {};
      this._connectPromise = null;
      this.isThumbnail = false;
      this.appMode = null;
      this.offline = false;
      this.isStaticDisplayForced = false;
      this._tracking = { isTrackable: false };
      // Only trustworthy while this script is being evaluated; from any later callback it reads
      // as null.
      this._sdkScriptUrl = document.currentScript ? document.currentScript.src : null;
      this._recordingTake = null;
      this._recorderLoadPromise = null;
      this._recordingGeneration = 0;
      this._nextClipSeq = 0;
      this._hasDeclaredAudio = false;
      this._isAudioMuted = false;
      this._audioAutoCaptureEnabled = false;
      this._audioSeen = false;
      // Keyed by element, valued with whether the widget itself had it muted when it was first
      // seen, so unmuting the view restores that instead of blanket-unmuting.
      this._audioElements = new Map();
      this._audioGains = new Set();
      this._masterGains = new WeakMap();
      this._retryStyleElement = null;

      // Wrapped whole: this runs before the widget's own code, so anything thrown here leaves a
      // document that never gets to build itself.
      try {
        this._installAudioInterceptors();
      } catch {
        // A widget whose audio the view cannot reach is a worse widget, not a broken one.
      }

      // The entire cost a widget that is never recorded pays for any of the below.
      window.addEventListener('message', event => this._handleRecordingMessage(event));
    }

    connect() {
      if (this._connectPromise) {
        return this._connectPromise;
      }

      this._connectPromise = new Promise(resolve => {
        const resolveWhenInit = event => {
          // A widget document is user code, so anything on the page can post a non-object
          // -- or nothing at all -- to this window. This listener cannot be retired after
          // the handshake either: it is also the permanent handler for the branches below.
          if (!event.data || typeof event.data !== 'object') {
            return;
          }

          if (event.data.type === 'init') {
            const initialConfig = event.data.data;
            this._tracking = initialConfig.tracking || { isTrackable: false };
            this.config = initialConfig;
            this.isThumbnail = initialConfig.isThumbnail;
            this.setAppMode(initialConfig.appMode);
            this.offline = initialConfig.offline || false;
            this.updateFonts(initialConfig);

            if (initialConfig.logrocketData) {
              this.loadLogrocket(initialConfig.logrocketData);
            }

            this._applyAudioMuteState(initialConfig.audioMuted === true);

            // Before the promise resolves, which is where the widget paints for the first time:
            // applying it afterwards would show the button for one frame and then take it away.
            this._applyRetryButtonVisibility(initialConfig.geniallyShowRetryButton);

            // Same pair that guards a recording take: a thumbnail is one of several live copies
            // of the widget and none of them is the one being listened to, and a frozen document
            // has had its timers taken away already.
            if (
              initialConfig.audioAutoCapture === true &&
              !this.isThumbnail &&
              !this.isStaticDisplayForced
            ) {
              this._enableAudioAutoCapture();
            }

            resolve(initialConfig);
          } else if (event.data.type === 'config') {
            this.updateFonts(event.data.data);

            this._applyRetryButtonVisibility(event.data.data?.geniallyShowRetryButton);

            this.config = event.data.data;
          } else if (event.data.type === 'iframeTrackingState') {
            this._tracking = { ...this._tracking, trackingState: event.data.data };
            this.fireEvent('trackingState', event.data.data);
          } else if (event.data.type === WIDGET_AUDIO_MUTE_STATE) {
            this._applyAudioMuteState(event.data.data?.muted === true);
          } else if (event.data.type === 'palette') {
            const colors = event.data.data;
            const rootNode = document.querySelector('html');

            colors.primary &&
              rootNode.style.setProperty('--genially-primary', colors.primary);
            colors.secondary &&
              rootNode.style.setProperty('--genially-secondary', colors.secondary);
            colors.tertiary &&
              rootNode.style.setProperty('--genially-tertiary', colors.tertiary);
          }
        };

        window.addEventListener('message', resolveWhenInit);

        window.parent.postMessage({ type: 'ready' }, '*');
      });

      return this._connectPromise;
    }

    set config(newConfig) {
      this._config = newConfig;
      this.fireEvent('config', newConfig);

      if (newConfig.appMode === 'editor' && !this.isStaticDisplayForced) {
        this.forceStaticDisplay();
        this.isStaticDisplayForced = true;
      }
    }

    get config() {
      return this._config;
    }

    get tracking() {
      return this._tracking;
    }

    setAppMode(mode) {
      if (mode !== 'editor' && mode !== 'view') {
        console.error(`Invalid appMode: ${mode}. Must be 'editor' or 'view'.`);
        return;
      }
      this.appMode = mode;
    }

    // This is an alias because often LLMs confuse 'trigger' and 'execute'
    trigger(action) {
      return this.runAction(action);
    }

    executeAction(action) {
      return this.runAction(action);
    }

    runAction(interactivityObject) {
      if (this.isStaticDisplayForced) {
        return;
      }

      if (!interactivityObject) {
        return;
      }

      if ('id' in interactivityObject) {
        window.parent.postMessage(
          {
            type: 'interactivity',
            data: interactivityObject.id,
          },
          '*',
        );
      } else {
        window.parent.postMessage(
          { type: 'interactivity', data: interactivityObject },
          '*',
        );
      }
    }

    playAudio(playAudioAction) {
      window.parent.postMessage({ type: 'playAudio', data: playAudioAction }, '*');
    }

    get isAudioMuted() {
      return this._isAudioMuted;
    }

    /**
     * Makes the view show its own mute control for this widget. Idempotent: the host keys the
     * requirement by script instance, so re-declaring is harmless, but a widget that declares on
     * every sound would post one message per sound for nothing.
     */
    declareAudio() {
      if (this._hasDeclaredAudio) {
        return;
      }

      this._hasDeclaredAudio = true;

      window.parent.postMessage(
        { type: WIDGET_AUDIO_PRESENCE, data: { hasAudio: true } },
        '*',
      );
    }

    /**
     * Hides or shows every tagged retry control. An explicit `false` always hides. A scoreable
     * widget also hides unless the host says `true`: its retry is opt-in, so an old host that
     * sends nothing leaves the button away. A non-scoreable widget keeps its button unless told
     * otherwise, exactly as before the flag existed.
     *
     * The stylesheet goes in on first use rather than at construction, so a widget that is never
     * told anything about retry pays nothing for it.
     */
    _applyRetryButtonVisibility(showRetryButton) {
      this._injectRetryStyle();

      const rootNode = document.querySelector('html');

      if (!rootNode) {
        return;
      }

      const hiddenByDefault =
        this._tracking.isScoreable === true && showRetryButton !== true;

      if (showRetryButton === false || hiddenByDefault) {
        rootNode.setAttribute(RETRY_HIDDEN_ATTRIBUTE, '');
      } else {
        rootNode.removeAttribute(RETRY_HIDDEN_ATTRIBUTE);
      }
    }

    // Keyed on the element still being in the document rather than on a "done" flag: a widget
    // that rewrites its own head would otherwise lose the rule for the rest of its life, and
    // nothing would put it back.
    _injectRetryStyle() {
      if (this._retryStyleElement && this._retryStyleElement.isConnected) {
        return;
      }

      const style = document.createElement('style');
      style.textContent = `
            html[${RETRY_HIDDEN_ATTRIBUTE}] [${RETRY_CONTROL_ATTRIBUTE}] {
                display: none !important;
            }
        `;
      document.head.appendChild(style);

      this._retryStyleElement = style;
    }

    _applyAudioMuteState(muted) {
      if (this._isAudioMuted === muted) {
        return;
      }

      this._isAudioMuted = muted;
      this.fireEvent('audioMute', { muted });
      this._applyCapturedAudioMuteState();
    }

    _installAudioInterceptors() {
      const sdk = this;
      const nativePlay = HTMLMediaElement.prototype.play;

      HTMLMediaElement.prototype.play = function play(...args) {
        sdk._registerAudioElement(this);

        return nativePlay.apply(this, args);
      };

      const patchedPrototypes = new Set();

      // Only the live contexts: an OfflineAudioContext renders to a buffer nobody hears, and
      // putting a gain in its path would change what a widget gets back from it.
      [window.AudioContext, window.webkitAudioContext].forEach(ContextClass => {
        // Safari aliases the prefixed name to the same class; patching one prototype twice would
        // leave a second gain stacked on the first, each capturing the other as "native".
        if (!ContextClass || patchedPrototypes.has(ContextClass.prototype)) {
          return;
        }

        patchedPrototypes.add(ContextClass.prototype);
        this._patchAudioContextDestination(ContextClass);
      });
    }

    _patchAudioContextDestination(ContextClass) {
      // The Web Audio API declares `destination` on BaseAudioContext, so reading only this
      // class's own prototype finds nothing. The override is nevertheless installed as an own
      // property of the live class, which shadows the inherited getter for it alone and leaves
      // OfflineAudioContext still reaching the untouched original.
      const descriptor = findPropertyDescriptor(ContextClass.prototype, 'destination');

      if (!descriptor || !descriptor.get) {
        return;
      }

      const sdk = this;
      const nativeDestination = descriptor.get;

      Object.defineProperty(ContextClass.prototype, 'destination', {
        configurable: true,
        get() {
          const existing = sdk._masterGains.get(this);

          if (existing) {
            return existing;
          }

          const nativeOutput = nativeDestination.call(this);
          const masterGain = this.createGain();

          masterGain.connect(nativeOutput);
          sdk._masterGains.set(this, masterGain);
          sdk._registerAudioGain(masterGain);

          return masterGain;
        },
      });
    }

    _registerAudioGain(masterGain) {
      this._audioGains.add(masterGain);
      this._audioSeen = true;

      if (this._audioAutoCaptureEnabled) {
        this.declareAudio();
        masterGain.gain.value = this._isAudioMuted ? 0 : 1;
      }
    }

    _registerAudioElement(element) {
      if (!this._audioElements.has(element)) {
        this._audioElements.set(element, element.muted === true);
      }

      // An element the widget keeps muted -- a `<video muted autoplay>` backdrop, say -- is not
      // evidence that this widget makes any sound.
      const isMutedByTheWidget = this._audioElements.get(element);

      if (!isMutedByTheWidget) {
        this._audioSeen = true;
      }

      if (this._audioAutoCaptureEnabled) {
        if (!isMutedByTheWidget) {
          this.declareAudio();
        }

        this._applyAudioMuteStateToElement(element);
      }
    }

    _applyAudioMuteStateToElement(element) {
      element.muted = this._isAudioMuted || this._audioElements.get(element) === true;
    }

    /**
     * Called from the `init` branch. Everything the interceptors saw before this point was only
     * recorded; this is where it becomes visible to the host.
     */
    _enableAudioAutoCapture() {
      if (this._audioAutoCaptureEnabled) {
        return;
      }

      this._audioAutoCaptureEnabled = true;

      if (this._audioSeen) {
        this.declareAudio();
      }

      this._applyCapturedAudioMuteState();
    }

    _applyCapturedAudioMuteState() {
      if (!this._audioAutoCaptureEnabled) {
        return;
      }

      this._audioElements.forEach((_isMutedByTheWidget, element) => {
        this._applyAudioMuteStateToElement(element);
      });

      // No such care is needed here: the master gain is this file's own node and was born at 1,
      // so restoring it to 1 cannot overwrite a level the widget chose. The widget's own nodes
      // sit upstream of it and are never touched.
      this._audioGains.forEach(masterGain => {
        masterGain.gain.value = this._isAudioMuted ? 0 : 1;
      });
    }

    fireInteractivity(interactivityObject) {
      window.parent.postMessage(
        { type: 'interactivity', data: interactivityObject },
        '*',
      );
    }

    canTrack() {
      return (
        this._tracking.isTrackable && this._tracking.trackingState?.canAnswer !== false
      );
    }

    onTrackingState(callback) {
      if (!this._tracking.isTrackable) return;
      this.on('trackingState', callback);
      if (this._tracking.trackingState) {
        callback(this._tracking.trackingState);
      }
    }

    getPreviouslyAnsweredAction(previousAnswer, config) {
      if (
        !this._tracking.isTrackable ||
        this._tracking.trackingState?.canAnswer !== false ||
        this._tracking.trackingState?.answeredInThisSession
      ) {
        return null;
      }
      const isCorrect = previousAnswer?.isCorrect;
      const action = isCorrect === false ? config.onFailAction : config.onCompletedAction;
      return action && !['effect', 'wait'].includes(action.type) ? action : null;
    }

    on(event, callback) {
      if (!this.handlers[event]) {
        this.handlers[event] = [];
      }

      this.handlers[event].push(callback);
    }

    fireEvent(event, data) {
      if (this.handlers[event]) {
        this.handlers[event].forEach(callback => {
          callback(data);
        });
      }
    }

    async loadCustomFont(fontFamily) {
      const { name, url } = fontFamily;
      const customFont = new FontFace(name, `url('${url}')`);

      try {
        await customFont.load();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Custom font could not be loaded`, err);

        return false;
      }

      document.fonts.add(customFont);

      return true;
    }

    loadGoogleFont(fontFamily) {
      if (this.offline) {
        const parsedFontFamily = `css/gf_${fontFamily.name.replace(/ /g, '')}.css`;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = parsedFontFamily;
        link.onerror = () => this.loadGoogleFontOnline(fontFamily.name);
        document.head.appendChild(link);

        return;
      }

      this.loadGoogleFontOnline(fontFamily.name);
    }

    loadGoogleFontOnline(fontName) {
      const encodedFontName = fontName.replace(/\s+/g, '+');
      const fontParam = `family=${encodedFontName}`;

      const googleFontsLink = document.querySelector(
        'link[href*="fonts.googleapis.com/css2"]',
      );

      if (googleFontsLink) {
        const currentUrl = googleFontsLink.href;

        if (!currentUrl.includes(fontParam)) {
          const newUrl = `${currentUrl}&${fontParam}`;
          googleFontsLink.href = newUrl;
        }
      } else {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?${fontParam}`;
        document.head.appendChild(link);
      }
    }

    setFontStyle(cssProperty, fontName) {
      const fallbackFonts = ['Source Sans Pro', 'Schibsted Grotesk', 'sans-serif'];

      document.documentElement.style.setProperty(
        cssProperty,
        [`'${fontName}'`, ...fallbackFonts].join(', '),
      );
    }

    loadFont(fontFamily) {
      const fontName = fontFamily.name;

      const isFontLoaded =
        document.fonts &&
        Array.from(document.fonts).some(font => font.family === fontName);

      if (!isFontLoaded) {
        const isCustomFont = !!fontFamily.url;

        if (isCustomFont) {
          this.loadCustomFont(fontFamily);
        } else {
          this.loadGoogleFont(fontFamily);
        }
      }
    }

    updateFonts(config) {
      const configFonts = Object.entries(config).filter(
        ([, value]) => value && value.$type === 'font',
      );

      configFonts.forEach(([key, value]) => {
        this.loadFont(value);
        this.setFontStyle(`--font-family-${key}`, value.name);
      });
    }

    setState(state) {
      window.parent.postMessage({ type: 'setState', data: state }, '*');
    }

    getState() {
      return new Promise(resolve => {
        const requestId = `getStateRequest_${Date.now()}_${Math.random()}`;

        const getStateListener = event => {
          if (!event.data || typeof event.data !== 'object') {
            return;
          }

          if (event.data.type === 'stateResponse' && event.data.requestId === requestId) {
            window.removeEventListener('message', getStateListener);
            resolve(event.data.data);
          }
        };

        window.addEventListener('message', getStateListener);

        window.parent.postMessage({ type: 'getState', requestId }, '*');
      });
    }

    loadLogrocket(appId) {
      const script = document.createElement('script');
      script.src = `https://cdn.logrocket.io/LogRocket.min.js`;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        LogRocket.init(appId, {
          mergeIframes: true,
          parentDomain: 'https://app.genially.com',
        });
      };

      document.head.appendChild(script);
    }

    _handleRecordingMessage(event) {
      // Every other listener in this file answers anyone, which is tolerable for fonts and
      // colours and stops being so for a message that can start serialising the whole document.
      if (event.source !== window.parent) {
        return;
      }

      const message = event.data;

      if (!message || typeof message !== 'object') {
        return;
      }

      switch (message.type) {
        case RECORDING_ARM:
          this._armRecording(message.payload, event.origin);
          break;

        case RECORDING_PAUSE:
          this._endRecordingClip();
          break;

        case RECORDING_RESUME:
          this._startRecordingClip();
          break;

        case RECORDING_STOP:
          this._endRecordingClip();
          this._recordingTake = null;
          break;

        default:
          break;
      }
    }

    _armRecording(payload, origin) {
      // A thumbnail is one of several live copies of the same widget and none of them is what a
      // take is about. A document that has been frozen has had its timers and its frame loop
      // taken away, so there is nothing left in it worth recording.
      if (this._recordingTake || this.isThumbnail || this.isStaticDisplayForced) {
        return;
      }

      if (
        !payload ||
        typeof payload !== 'object' ||
        payload.protocolVersion !== RECORDING_PROTOCOL_VERSION ||
        !payload.fidelity ||
        typeof payload.fidelity !== 'object' ||
        // Clips go to the origin the arm arrived from, never to the one it names. The field is
        // kept as a cross-check, so an arm relayed from somewhere the host did not mean is
        // refused, but a payload able to redirect the output would make checking the sender
        // pointless.
        payload.targetOrigin !== origin
      ) {
        return;
      }

      this._recordingTake = {
        targetOrigin: origin,
        // Rebuilt field by field rather than carried over, so the only recorder options the host
        // can reach are the three this protocol carries. Handing the object across whole would
        // let it set one that turns `emit` into dead code with no error raised anywhere.
        fidelity: {
          inlineImages: payload.fidelity.inlineImages === true,
          collectFonts: payload.fidelity.collectFonts === true,
          recordCanvas: payload.fidelity.recordCanvas === true,
        },
        stopRecorder: null,
      };

      this._startRecordingClip();
    }

    _startRecordingClip() {
      const take = this._recordingTake;

      if (!take || typeof take.stopRecorder === 'function') {
        return;
      }

      // The bundle can still be in flight when the take is paused, stopped or resumed again, and
      // every start waits on the same shared load: without this, each of them would wake up and
      // start a recorder of its own.
      const generation = ++this._recordingGeneration;

      this._loadRecorder()
        .then(record => {
          if (this._recordingGeneration !== generation) {
            return;
          }

          const clipSeq = this._nextClipSeq++;

          take.stopRecorder = record({
            // Guarded by the same counter as the start: the recorder wraps its whole body in a
            // try/catch that warns and returns nothing, so a throw after its observers are
            // attached leaves a recorder that cannot be stopped. Without this, that one would
            // keep pouring events tagged with a clip that has already been closed into the next.
            emit: recordedEvent => {
              if (this._recordingGeneration !== generation) {
                return;
              }

              this._postClipEvents(take, clipSeq, recordedEvent);
            },
            ...take.fidelity,
          });
        })
        .catch(() => {
          console.warn('Recorder bundle could not be loaded, nothing will be recorded');
        });
    }

    _endRecordingClip() {
      const take = this._recordingTake;

      if (!take) {
        return;
      }

      this._recordingGeneration++;

      // The recorder returns nothing when it declines to start.
      if (typeof take.stopRecorder === 'function') {
        take.stopRecorder();
      }

      take.stopRecorder = null;
    }

    _loadRecorder() {
      // Memoised even once it has failed: one attempt per document, so a take that keeps arming
      // cannot queue up requests for a bundle that is not there.
      if (this._recorderLoadPromise) {
        return this._recorderLoadPromise;
      }

      this._recorderLoadPromise = new Promise((resolve, reject) => {
        if (!this._sdkScriptUrl) {
          reject(new Error('Cannot resolve the recorder bundle: unknown script URL'));
          return;
        }

        const script = document.createElement('script');
        script.src = new URL(RECORDER_BUNDLE_PATH, this._sdkScriptUrl).href;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          const recorder = window.rrwebRecord;

          if (recorder && typeof recorder.record === 'function') {
            resolve(recorder.record);
          } else {
            reject(new Error('The recorder bundle exposed no record function'));
          }
        };
        script.onerror = () => reject(new Error('The recorder bundle failed to load'));

        document.head.appendChild(script);
      });

      return this._recorderLoadPromise;
    }

    _postClipEvents(take, clipSeq, recordedEvent) {
      try {
        window.parent.postMessage(
          {
            type: RECORDING_CLIP_EVENTS,
            payload: {
              protocolVersion: RECORDING_PROTOCOL_VERSION,
              clipSeq,
              atAbsoluteMs: Date.now(),
              events: [recordedEvent],
            },
          },
          take.targetOrigin,
        );
      } catch {
        // This runs inside the recorder's own emit call, so anything thrown here unwinds through
        // third-party code and can leave the widget's document broken for the rest of its life.
      }
    }

    forceStaticDisplay() {
      this._disableAnimationsAndInteractions();
      this._killTimersAfterDomSettles();
    }

    _disableAnimationsAndInteractions() {
      const style = document.createElement('style');
      style.textContent = `
            *, *::before, *::after {
                animation-duration: 0s !important;
                animation-delay: 0s !important;
                animation-fill-mode: forwards !important;
                transition: none !important;
                transition-duration: 0s !important;
            }
            body {
                pointer-events: none !important;
                user-select: none !important;
            }
        `;
      document.head.appendChild(style);
    }

    _killTimersAfterDomSettles() {
      const DOM_QUIET_PERIOD_MS = 500;
      const MAX_FREEZE_DEADLINE_MS = 1500;

      // Capture the real timer functions before we replace them with no-ops
      const originalSetInterval = window.setInterval.bind(window);
      const originalClearInterval = window.clearInterval.bind(window);
      const originalSetTimeout = window.setTimeout.bind(window);
      const originalClearTimeout = window.clearTimeout.bind(window);

      let quietPeriodTimer = null;
      let activityStopped = false;

      const clearAllTimersAndBlockNew = () => {
        // Clear all existing timers by iterating
        // up to the highest timer ID and clearing them
        const highestId = originalSetInterval(() => {}, 10);
        for (let i = 0; i <= highestId; i++) {
          originalClearInterval(i);
          originalClearTimeout(i);
        }
        // Replace scheduling APIs with no-ops so the widget can't start new timers
        window.setInterval = () => 0;
        window.setTimeout = () => 0;
        window.requestAnimationFrame = () => 0;
      };

      const stopAllWidgetActivity = () => {
        if (activityStopped) {
          return;
        }
        activityStopped = true;
        domChangeObserver.disconnect();
        if (quietPeriodTimer !== null) {
          originalClearTimeout(quietPeriodTimer);
        }
        clearAllTimersAndBlockNew();
      };

      // Every DOM mutation resets the countdown back to zero.
      // Only after DOM_QUIET_PERIOD_MS of silence passes we run stopAllWidgetActivity.
      const restartQuietPeriodCountdown = () => {
        if (quietPeriodTimer !== null) {
          originalClearTimeout(quietPeriodTimer);
        }
        quietPeriodTimer = originalSetTimeout(stopAllWidgetActivity, DOM_QUIET_PERIOD_MS);
      };

      const domChangeObserver = new MutationObserver(restartQuietPeriodCountdown);

      domChangeObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      restartQuietPeriodCountdown();

      originalSetTimeout(stopAllWidgetActivity, MAX_FREEZE_DEADLINE_MS);
    }
  }

  window.genially = new Genially();
})();
