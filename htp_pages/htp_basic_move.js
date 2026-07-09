// =====================================
// htp_basic_move.js
// あそびかた：1. 基本操作 (移動デモ)
// サブフォルダ (htp_pages) から動的に読み込まれます
// =====================================

window.HTP_BasicMove = {
    stick: null, 
    arrow: null, 
    finger: null,

    // how_to_play.js から呼び出され、DOMを生成する
    init: function(container, htpManager) {
        container.innerHTML = `
            <div class="htp-demo-area">
                <div id="htp-demo-canvas-container"></div>
                <div class="htp-demo-joystick-base">
                    <div class="htp-demo-arrow" id="htp-demo-arrow"></div>
                    <div class="htp-demo-joystick-stick" id="htp-demo-stick">
                        <div class="htp-demo-finger" id="htp-demo-finger">👆</div>
                    </div>
                </div>
                <div class="htp-demo-jump">JUMP</div>
            </div>
            
            <div class="htp-desc-area">
                <div class="htp-desc-title">移動とカメラ</div>
                <div>
                    画面の左側をドラッグ（指でなぞる）すると、ジョイスティックが現れます。<br>
                    動かしたい方向へ指をスライドさせると、キャラクターがその方向へ進みます。<br><br>
                    <span style="color:#ffcc00; font-weight:bold;">※カメラは自動で背後を追いかけるため、手動での視点操作は不要です！</span>
                </div>
            </div>
            
            <div class="htp-page-footer">
                <div></div> <!-- 左側のスペース埋め -->
                <button class="htp-nav-btn" id="htp-next-jump">つぎへ ▶</button>
            </div>
        `;

        // UI要素の取得
        this.stick = document.getElementById('htp-demo-stick');
        this.arrow = document.getElementById('htp-demo-arrow');
        this.finger = document.getElementById('htp-demo-finger');

        // 次のページへの遷移処理（ジャンプページは次回作成します）
        document.getElementById('htp-next-jump').addEventListener('click', () => {
            // htpManager.openPage('htp_basic_jump.js', 'HTP_BasicJump', '1. 基本操作 (ジャンプ)');
            alert('ジャンプのページは次回作成します！');
        });

        // HTML生成が終わったら3Dデモを開始させる
        htpManager.startDemo();
    },

    // 毎フレーム how_to_play.js から呼び出されるシナリオ処理
    updateScenario: function(time, delta, demo) {
        const cycle = time % 10.0;
        let inputX = 0, inputY = 0; // X:右(1), Y:前(1)
        let isMoving = false;
        let isTouching = false;

        // シナリオ進行
        if (cycle > 0.5 && cycle <= 2.0) {
            inputX = 0; inputY = 1.0; // 1. 前進
            isMoving = true; isTouching = true;
        } else if (cycle > 2.5 && cycle <= 4.0) {
            inputX = 0; inputY = -1.0; // 2. 後退
            isMoving = true; isTouching = true;
        } else if (cycle > 4.5 && cycle <= 6.5) {
            inputX = 0.707; inputY = 0.707; // 3. 右斜め前
            isMoving = true; isTouching = true;
        } else if (cycle > 7.0 && cycle <= 9.0) {
            inputX = -0.707; inputY = 0.707; // 4. 左斜め前
            isMoving = true; isTouching = true;
        } else {
            // 指をタッチする予備動作
            if ((cycle > 0.3 && cycle <= 0.5) || 
                (cycle > 2.3 && cycle <= 2.5) || 
                (cycle > 4.3 && cycle <= 4.5) ||
                (cycle > 6.8 && cycle <= 7.0)) {
                isTouching = true;
            }
        }

        // --- UI（ジョイスティックと指）の視覚的更新 ---
        const maxStickDist = 20; 
        const stickX = inputX * maxStickDist;
        const stickY = -inputY * maxStickDist; 
        
        if (this.stick) this.stick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
        
        if (isMoving) {
            if (this.arrow) {
                this.arrow.style.opacity = '1';
                const arrowAngle = Math.atan2(stickY, stickX) * (180 / Math.PI) + 90;
                this.arrow.style.transform = `rotate(${arrowAngle}deg) translateY(-22px)`;
            }
        } else {
            if (this.arrow) this.arrow.style.opacity = '0';
        }

        if (isTouching) {
            if (this.finger) this.finger.style.transform = 'scale(1.0) translateY(0)';
        } else {
            if (this.finger) this.finger.style.transform = 'scale(1.1) translateY(5px)';
        }

        // --- 本編ロジックへ渡すためのContext更新 ---
        if (isMoving) {
            demo.context.moveVector.set(inputX, -inputY);
        } else {
            // 止まっている時は入力を0にし、正面とカメラをリセット
            demo.context.moveVector.set(0, 0);
            
            const targetAngle = Math.PI; 
            const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
            demo.player.quaternion.slerp(rotQuat, 6 * delta);
            demo.context.currentFacingAngle = targetAngle;
            
            let diffCam = 0 - demo.context.cameraAngle;
            while (diffCam > Math.PI) diffCam -= Math.PI * 2;
            while (diffCam < -Math.PI) diffCam += Math.PI * 2;
            demo.context.cameraAngle += diffCam * 4.0 * delta;
        }
    },

    // ページを閉じる・遷移する際に実行されるクリーンアップ
    cleanup: function(htpManager) {
        this.stick = null;
        this.arrow = null;
        this.finger = null;
    }
};
