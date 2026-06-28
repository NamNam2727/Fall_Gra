// =========================================================
// loader.js
// =========================================================

(function() {
    const baseURL = 'https://namnam2727.github.io/Fall_Gra/';
    
    // ui.js を新規追加
    const scriptsToLoad = [
        'globals.js',
        'ui.js',      // ← UI生成スクリプト
        'map.js',
        'player.js',
        'input.js',
        'main.js'
    ];

    const externalScripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
    ];

    let loadedExternalCount = 0;
    let loadedLocalCount = 0;

    function loadScript(src, isExternal, callback) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        
        if (isExternal) {
            script.src = src;
        } else {
            script.src = baseURL + 'js/' + src + '?v=' + new Date().getTime(); 
        }
        
        script.onload = () => {
            console.log(`Loaded: ${src}`);
            callback();
        };
        
        script.onerror = () => {
            console.error(`Failed to load: ${src}`);
        };

        document.head.appendChild(script);
    }

    function loadExternalNext() {
        if (loadedExternalCount < externalScripts.length) {
            loadScript(externalScripts[loadedExternalCount], true, () => {
                loadedExternalCount++;
                loadExternalNext();
            });
        } else {
            loadLocalNext(); 
        }
    }

    function loadLocalNext() {
        if (loadedLocalCount < scriptsToLoad.length) {
            loadScript(scriptsToLoad[loadedLocalCount], false, () => {
                loadedLocalCount++;
                loadLocalNext();
            });
        } else {
            console.log('All scripts loaded. Initializing game...');
            startGame();
        }
    }

    function startGame() {
        // UIの動的生成を実行
        if (typeof window.initUI === 'function') window.initUI();
        
        if (typeof window.initThreeJS === 'function') window.initThreeJS();
        if (typeof window.setupInputs === 'function') window.setupInputs();
        
        if (typeof window.animate === 'function') {
            requestAnimationFrame(window.animate);
        }
    }

    loadExternalNext();
})();

