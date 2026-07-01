// =========================================================
// loader.js
// 外部JSファイルを順番に読み込み、ゲームを初期化・起動する
// =========================================================

(function() {
    const baseURL = 'https://namnam2727.github.io/Fall_Gra/';
    
    // ★追加: minigame_list.js と minigame_manager.js を読み込みリストに追加
    const coreScripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
        'globals.js',
        'ui.js',
        'chat_system.js',
        'minigame_list.js',
        'minigame_manager.js',
        'mapGenerator.js',
        'map.js',
        'player.js',
        'input.js',
        'item_system.js',
        'multiplayer.js',
        'main.js'
    ];

    let loadedCount = 0;

    window.loadGameScript = function(src, callback) {
        const script = document.createElement('script');
        script.type = 'text/javascript';
        
        if (src.startsWith('http')) {
            script.src = src;
        } else {
            script.src = baseURL + src + '?v=' + new Date().getTime(); 
        }
        
        script.onload = () => {
            console.log(`Loaded: ${src}`);
            if (typeof callback === 'function') callback();
        };
        script.onerror = () => {
            console.error(`Failed to load: ${src}`);
            if (typeof callback === 'function') callback();
        };
        document.head.appendChild(script);
    };

    function loadNext() {
        if (loadedCount < coreScripts.length) {
            window.loadGameScript(coreScripts[loadedCount], () => {
                loadedCount++;
                loadNext();
            });
        } else {
            console.log('All core scripts loaded. Initializing game...');
            startGame();
        }
    }

    function startGame() {
        try {
            if (typeof window.animate !== 'function' && typeof animate !== 'function') {
                const errMsg = 'Error: main.js の初期化関数(animate)が見つかりません。';
                console.error(errMsg);
                document.body.innerHTML += `<div style="color:red; font-weight:bold; position:absolute; z-index:9999; top:10px; left:10px; background:rgba(255,255,255,0.9); padding:10px; border-radius:5px;">${errMsg}</div>`;
                return;
            }

            if (typeof window.initUI === 'function') window.initUI();
            else if (typeof initUI === 'function') initUI();
            
            if (typeof window.initChatSystem === 'function') window.initChatSystem();
            else if (typeof initChatSystem === 'function') initChatSystem();
            
            if (typeof window.initThreeJS === 'function') window.initThreeJS();
            else if (typeof initThreeJS === 'function') initThreeJS();
            
            if (typeof window.setupInputs === 'function') window.setupInputs();
            else if (typeof setupInputs === 'function') setupInputs();

            const animFunc = typeof window.animate === 'function' ? window.animate : animate;
            requestAnimationFrame(animFunc);
            
        } catch (e) {
            document.body.innerHTML += `<div style="color:red; font-weight:bold; position:absolute; z-index:9999; top:60px; left:10px; background:rgba(255,255,255,0.9); padding:10px; border-radius:5px;">起動エラー: ${e.message}</div>`;
            console.error(e);
        }
    }

    loadNext();
})();
