function wrapPlatformResourceLoader(resourceLoader, key) {
    let wrappedResourceLoader = getFromCache(resourceLoader, key);
    if (wrappedResourceLoader) {
      return wrappedResourceLoader;
    }
    wrappedResourceLoader = {
      loadScript: (cmp, url, config) => {
        if (config && config.trustedMode) {
          // To load a script in trusted mode (or system mode), we have to pass a mock 1st party (i.e. file system) component as the 1st parameter
          // of loadScript, because it gets the document to insert the script element from the template.ownerDocument of the component. For 2nd
          // and 3rd party components, ownerDocument is a SecureDocuments, but for 1sr party components, it is the actual global Document.
          const mock1stPartyCmp = {
            template: {
              ownerDocument: document // this is the actual global Document
            }
          };
          const loadScriptPromise = resourceLoader.loadScript(mock1stPartyCmp, url);
          return loadScriptPromise.then(() => {
            const {
              trustedGlobals
            } = config;
            if (trustedGlobals) {
              const src = `(list) => list.forEach(([key, get, set]) => Object.defineProperty(window, key, { get, set, configurable: true, enumerable: true }));`;
              const installGlobals = evaluate(src, key);
              const globals = trustedGlobals.map(globalName => [globalName, function get() {
                return window[globalName];
              }, function set(value) {
                window[globalName] = value;
              }]);
              installGlobals(globals);
            }
          });
        }
        // Here we pass the actual component, which could be 1st, 2nd or 3rd party.
        return resourceLoader.loadScript(cmp, url);
      },
      loadStyle: resourceLoader.loadStyle
    };
    setRef(wrappedResourceLoader, resourceLoader, key);
    addToCache(resourceLoader, wrappedResourceLoader, key);
    return wrappedResourceLoader;
  }

  /**
   * Wrap an object from origin module(exporter) to be used in the destination module(importer).
   * @param {*} thing Object being imported
   * @param {*} metaFrom Metadata about origin of 'thing'
   * @param {*} metaTo Metadata about destination where 'thing' is being used
   */
  function wrap(thing, metaFrom, metaTo, useLockerNext = false, isInternalNamespace = false) {
    const toKey = getRuntimeNamespaceKey(metaTo);
    const metaFromName = metaFrom.getFullName();

    // Locker vNext membrane handles wrapping the dependencies without the need
    // to create Secure Objects with the exception of LWC.
    if (useLockerNext) {
      const key = isInternalNamespace ? CORE_SANDBOX_KEY$LWS : toKey.namespace;
      return wrapDependency$LWS(thing, metaFromName, key);
    }
    if (['lwc', 'engine'].includes(metaFromName)) {
      return SecureLWC(thing, toKey);
    }

    // check against internalLibs that are allowed
    // they just need to be frozen
    const fromNamespace = `${metaFrom.getNamespace().toLowerCase()}`;
    const lwcModuleName = `${fromNamespace}/${metaFrom.getName()}`;
    if (internalLibs.includes(lwcModuleName)) {
      if (!frozenLibRegistry.has(thing)) {
        if (lwcModuleName === 'lightning/platformResourceLoader' && isGaterEnabledFeature$LWS('enableTrustedMode')) {
          thing = wrapPlatformResourceLoader(thing, toKey);
        }
        shallowFreeze(thing);
        frozenLibRegistry.add(thing);
      }
      return thing;
    }
    const fromKey = getRuntimeNamespaceKey(metaFrom);

    // Prevent cross namespace(custom ns to custom ns) references in html/js
    if (fromKey !== defaultKey && toKey !== defaultKey && fromKey !== toKey && !['lockerlwc', 'securemoduletest', 'secureothernamespace', 'lockernexttest'].includes(fromNamespace)) {
      // Cross namespace reference is prohobited currently
      throw new error(`Attempting to reference cross-namespace module ${metaFrom.getNamespace()}-${metaFrom.getName()} in ${metaTo.getNamespace()}-${metaTo.getName()}`);
    }
    // class imports
    if (typeof thing === 'function') {
      return thing;
    }

    // begin wrapping module imports
    // there is no point in wrapping modules with same key and same security level
    // wrapping only occurs in these scenarios:
    //   -- Locker --> system
    //   -- system --> Locker
    //   -- Locker A --> Locker B (must be temporarily disabled)
    if (fromKey === toKey) {
      return thing;
    }
    return SecureLib(thing, fromKey, toKey);
  }
