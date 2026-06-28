// =====================================
// ui.js
// HTMLのUI要素やCSSを動的に生成して画面に追加する
// =====================================

function initUI() {
    // 1. スタイルの生成と追加
    const style = document.createElement('style');
    style.innerHTML = `
        #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        #instructions {
            position: absolute; top: 20px; left: 20px; color: #fff;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 15px; font-weight: bold;
            text-shadow: 1px 1px 3px rgba(0,0,0,0.8); background: rgba(0, 0, 0, 0.4);
            padding: 10px 15px; border-radius: 8px;
        }
        #joystick-base {
            position: absolute; width: 120px; height: 120px; border: 3px solid rgba(255, 255, 255, 0.6);
            border-radius: 50%; background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.3) 100%);
            transform: translate(-50%, -50%); display: none; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            pointer-events: none;
        }
        #joystick-stick {
            position: absolute; width: 60px; height: 60px; background: rgba(255, 255, 255, 0.9);
            border-radius: 50%; top: 50%; left: 50%; transform: translate(-50%, -50%); box-shadow: 0 4px 8px rgba(0,0,0,0.4);
        }
        #jump-btn {
            position: absolute; bottom: 40px; right: 40px; width: 80px; height: 80px;
            background: rgba(255, 255, 255, 0.5); border: 3px solid rgba(255, 255, 255, 0.8); border-radius: 50%;
            display: flex; justify-content: center; align-items: center; color: #333; font-weight: bold;
            font-family: sans-serif; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            pointer-events: auto; cursor: pointer;
        }
        #jump-btn:active { background: rgba(255, 255, 255, 0.8); transform: scale(0.95); }
    `;
    document.head.appendChild(style);

    // 2. DOM要素の生成と追加
    const uiLayer = document.createElement('div');
    uiLayer.id = 'ui-layer';

    const instructions = document.createElement('div');
    instructions.id = 'instructions';
    instructions.innerHTML = '移動：画面左側ドラッグ<br>ジャンプ：右下ボタン';
    uiLayer.appendChild(instructions);

    const joystickBase = document.createElement('div');
    joystickBase.id = 'joystick-base';
    const joystickStick = document.createElement('div');
    joystickStick.id = 'joystick-stick';
    joystickBase.appendChild(joystickStick);
    uiLayer.appendChild(joystickBase);

    const jumpBtn = document.createElement('div');
    jumpBtn.id = 'jump-btn';
    jumpBtn.innerText = 'JUMP';
    uiLayer.appendChild(jumpBtn);

    document.body.appendChild(uiLayer);
}

