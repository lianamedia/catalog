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
    }

    connect() {
      if (this._connectPromise) {
        return this._connectPromise;
      }

      this._connectPromise = new Promise(resolve => {
        const resolveWhenInit = event => {
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
            resolve(initialConfig);
          } else if (event.data.type === 'config') {
            this.updateFonts(event.data.data);

            this.config = event.data.data;
          } else if (event.data.type === 'iframeTrackingState') {
            this._tracking = { ...this._tracking, trackingState: event.data.data };
            this.fireEvent('trackingState', event.data.data);
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
