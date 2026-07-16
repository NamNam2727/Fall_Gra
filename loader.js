// =====================================
// loader.js
// ゲームに必要な全JSファイルを順番に読み込み、初期化する
// ★ map.js を廃止し、map_list.js と map_manager.js、デフォルトマップデータに入れ替え
// =====================================

(function() {
    const baseURL = 'https://namnam2727.github.io/Fall_Gra/';
    
    // 読み込むスクリプトのリスト
    const coreScripts = [
        'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
        'globals.js',
        'ui.js',
        'chat_system.js',
        'minigame_list.js',
        'minigame_sync.js',
        'minigame_flow.js',
        'minigame_core.js',
        'minigame_ui.js',
        'how_to_play.js',
        'map_list.js',             // ★ 追加: マップリスト
        'maps/map_default.js',     // ★ 追加: 初期マップデータ
        'mapGenerator.js',
        'map_manager.js',          // ★ 追加: マップマネージャー
        'player.js',
        'input.js',
        'item_system.js',
        'item_effects.js',
        'multiplayer.js',
        'main.js',
        'debug_map.js'
        'debug_item.js',
    ];

    let loadedCount = 0;

    // ==========================================
    // ローディングUIの作成と表示
    // ==========================================
    const loadingScreen = document.createElement('div');
    loadingScreen.id = 'game-loading-screen';
    loadingScreen.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background: url('https://namnam2727.github.io/Fall_Gra/title.PNG') center/cover no-repeat; z-index:999999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:sans-serif; transition: opacity 0.5s ease;";
    
    const panel = document.createElement('div');
    panel.style.cssText = 'background: rgba(0, 0, 0, 0.7); border: 1px solid #555; border-radius: 12px; padding: 30px 40px; display: flex; flex-direction: column; align-items: center; width: 80%; max-width: 400px; box-sizing: border-box; box-shadow: 0 4px 15px rgba(0,0,0,0.5);';

    const title = document.createElement('h1');
    title.innerText = "Loading Game...";
    title.style.cssText = 'font-size:32px; margin-bottom:20px; color:#ffaa00; text-shadow:0 0 10px rgba(255,170,0,0.8); margin-top:0; text-align: center;';
    
    const barContainer = document.createElement('div');
    barContainer.style.cssText = 'width:100%; height:12px; background:#333; border-radius:6px; overflow:hidden; margin-bottom:15px; box-shadow:inset 0 2px 4px rgba(0,0,0,0.8); border: 2px solid #555;';
    
    const barFill = document.createElement('div');
    barFill.style.cssText = 'width:0%; height:100%; background:linear-gradient(90deg, #ffaa00, #ffea00); transition: width 0.1s ease-out;';
    
    const progressText = document.createElement('div');
    progressText.style.cssText = 'font-size:15px; color:#ddd; font-weight:bold; font-family: monospace; text-shadow: 1px 1px 2px black; text-align: center;';
    progressText.innerText = `0 / ${coreScripts.length} scripts loaded`;

    barContainer.appendChild(barFill);
    panel.appendChild(title);
    panel.appendChild(barContainer);
    panel.appendChild(progressText);
    loadingScreen.appendChild(panel);
    document.body.appendChild(loadingScreen);

    // ==========================================
    // スクリプトの読み込み処理
    // ==========================================
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
                const percentage = Math.floor((loadedCount / coreScripts.length) * 100);
                barFill.style.width = percentage + '%';
                progressText.innerText = `${loadedCount} / ${coreScripts.length} scripts loaded`;
                loadNext();
            });
        } else {
            console.log('All core scripts loaded. Initializing game...');
            setTimeout(startGame, 300);
        }
    }

    function startGame() {
        try {
            if (typeof window.animate !== 'function' && typeof animate !== 'function') {
                const errMsg = 'Error: main.js の初期化関数(animate)が見つかりません。';
                console.error(errMsg);
                document.body.innerHTML += `<div style="color:red; font-weight:bold; position:absolute; z-index:9999; top:10px; left:10px; background:rgba(255,255,255,0.9); padding:10px; border-radius:5px;\">${errMsg}</div>`;
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
            
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                if (loadingScreen.parentNode) {
                    loadingScreen.parentNode.removeChild(loadingScreen);
                }
            }, 500);
            
        } catch (e) {
            document.body.innerHTML += `<div style="color:red; font-weight:bold; position:absolute; z-index:9999; top:60px; left:10px; background:rgba(255,255,255,0.9); padding:10px; border-radius:5px;\">起動エラー: ${e.message}</div>`;
            console.error(e);
        }
    }

    loadNext();
})();


