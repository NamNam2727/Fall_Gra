// =====================================
// htp_basic.js
// あそびかた：1. 基本操作 (移動・ジャンプ)
// =====================================

window.HTP_Basic = {
    currentMode: 'move', // 'move' または 'jump'
    stick: null, arrow: null, fingerMove: null,
    jumpBtn: null, fingerJump: null,
    hasJumpedInCycle: false,

    init: function(container, htpManager) {
        // 1つのデモエリアを共有し、説明文(パネル)だけを切り替える構造
        container.innerHTML = `
            <div class="htp-demo-area">
                <div id="htp-demo-canvas-container"></div>
                <div class="htp-demo-joystick-base">
                    <div class="htp-demo-arrow" id="htp-demo-arrow"></div>
                    <div class="htp-demo-joystick-stick" id="htp-demo-stick">
                        <div class="htp-demo-finger" id="htp-demo-finger-move">👆</div>
                    </div>
                </div>
                <div class="htp-demo-jump" id="htp-demo-jump-btn">
                    JUMP
                    <div class="htp-demo-finger" id="htp-demo-finger-jump" style="display:none; top:20px; left:20px;">👆</div>
                </div>
            </div>
            
            <!-- 移動のパネル -->
            <div id="htp-panel-move" style="display: flex; flex-direction: column; flex: 1;">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">移動とカメラ</div>
                    <div>
                        画面の左側をドラッグ（指でなぞる）すると、ジョイスティックが現れます。<br>
                        動かしたい方向へ指をスライドさせると、キャラクターがその方向へ進みます。<br><br>
                        <span style="color:#ffcc00; font-weight:bold;">※カメラは自動で背後を追いかけるため、手動での視点操作は不要です！</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <div></div>
                    <button class="htp-nav-btn" id="htp-btn-to-jump">ジャンプについて ▶</button>
                </div>
            </div>

            <!-- ジャンプのパネル -->
            <div id="htp-panel-jump" style="display: none; flex-direction: column; flex: 1;">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">ジャンプ</div>
                    <div>
                        画面右下の「JUMP」ボタンを押すと、キャラクターがジャンプします。<br><br>
                        走りながらジャンプすることで、段差を飛び越えたり、より遠くへ飛ぶことができます。
                    </div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" id="htp-btn-to-move">◀ まえへ</button>
                    <div></div>
                </div>
            </div>
        `;

        this.stick = document.getElementById('htp-demo-stick');
        this.arrow = document.getElementById('htp-demo-arrow');
        this.fingerMove = document.getElementById('htp-demo-finger-move');
        this.jumpBtn = document.getElementById('htp-demo-jump-btn');
        this.fingerJump = document.getElementById('htp-demo-finger-jump');

        // 移動 -> ジャンプ への切り替え
        document.getElementById('htp-btn-to-jump').addEventListener('click', () => {
            this.currentMode = 'jump';
            document.getElementById('htp-panel-move').style.display = 'none';
            document.getElementById('htp-panel-jump').style.display = 'flex';
            this.fingerJump.style.display = 'block';
            
            this.resetScenarioState(htpManager);
        });

        // ジャンプ -> 移動 への切り替え
        document.getElementById('htp-btn-to-move').addEventListener('click', () => {
            this.currentMode = 'move';
            document.getElementById('htp-panel-move').style.display = 'flex';
            document.getElementById('htp-panel-jump').style.display = 'none';
            this.fingerJump.style.display = 'none';
            
            this.resetScenarioState(htpManager);
        });

        htpManager.startDemo();
    },

    resetScenarioState: function(htpManager) {
        htpManager.demo.context.moveVector.set(0, 0);
        htpManager.demo.context.cameraAngle = 0;
        htpManager.demo.context.currentFacingAngle = Math.PI;
        this.hasJumpedInCycle = false;
        
        // スティック位置のリセット
        if (this.stick) this.stick.style.transform = 'translate(-50%, -50%)';
        if (this.arrow) this.arrow.style.opacity = '0';
        if (this.jumpBtn) {
            this.jumpBtn.style.transform = 'scale(1.0)';
            this.jumpBtn.style.background = 'rgba(255, 255, 255, 0.5)';
        }
    },

    updateScenario: function(time, delta, demo) {
        if (this.currentMode === 'move') {
            this.updateMoveScenario(time, delta, demo);
        } else {
            this.updateJumpScenario(time, delta, demo);
        }
    },

    // ==========================================
    // シナリオ1：移動
    // ==========================================
    updateMoveScenario: function(time, delta, demo) {
        const cycle = time % 10.0;
        let inputX = 0, inputY = 0;
        let isMoving = false, isTouching = false;

        if (cycle > 0.5 && cycle <= 2.0) {
            inputX = 0; inputY = 1.0; 
            isMoving = true; isTouching = true;
        } else if (cycle > 2.5 && cycle <= 4.0) {
            inputX = 0; inputY = -1.0; 
            isMoving = true; isTouching = true;
        } else if (cycle > 4.5 && cycle <= 6.5) {
            inputX = 0.707; inputY = 0.707; 
            isMoving = true; isTouching = true;
        } else if (cycle > 7.0 && cycle <= 9.0) {
            inputX = -0.707; inputY = 0.707; 
            isMoving = true; isTouching = true;
        } else {
            if ((cycle > 0.3 && cycle <= 0.5) || (cycle > 2.3 && cycle <= 2.5) || 
                (cycle > 4.3 && cycle <= 4.5) || (cycle > 6.8 && cycle <= 7.0)) {
                isTouching = true;
            }
        }

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
            demo.context.moveVector.set(inputX, -inputY);
        } else {
            if (this.arrow) this.arrow.style.opacity = '0';
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

        if (isTouching) {
            if (this.fingerMove) this.fingerMove.style.transform = 'scale(1.0) translateY(0)';
        } else {
            if (this.fingerMove) this.fingerMove.style.transform = 'scale(1.1) translateY(5px)';
        }
    },

    // ==========================================
    // シナリオ2：ジャンプ
    // ==========================================
    updateJumpScenario: function(time, delta, demo) {
        const cycle = time % 6.0;
        let inputX = 0, inputY = 0; 
        let isMoving = false, moveTouching = false, jumpPressed = false;

        // 走り込み区間 (1.0 ~ 5.0)
        if (cycle > 1.0 && cycle <= 5.0) {
            inputX = 0; inputY = 1.0; 
            isMoving = true; moveTouching = true;
        } else if ((cycle > 0.8 && cycle <= 1.0) || (cycle > 5.0 && cycle <= 5.2)) {
            moveTouching = true; // タッチ予備動作
        }

        // ジャンプ入力 (2.5秒付近で一瞬ボタンを押す)
        if (cycle > 2.5 && cycle <= 2.8) {
            jumpPressed = true;
        }
        
        // 本編ロジックに「ジャンプした」と教えるトリガー
        if (cycle > 2.5 && cycle < 2.6 && !this.hasJumpedInCycle) {
            demo.context.isJumping = true;
            // 実際のジャンプ力(jumpPower)を付与。未定義の場合は固定値
            demo.context.verticalVelocity = typeof jumpPower !== 'undefined' ? jumpPower : 26.8;
            this.hasJumpedInCycle = true;
        }
        
        // サイクル終了でフラグリセット
        if (cycle > 5.5) {
            this.hasJumpedInCycle = false;
        }

        // --- UIの更新 ---
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

        if (moveTouching) {
            if (this.fingerMove) this.fingerMove.style.transform = 'scale(1.0) translateY(0)';
        } else {
            if (this.fingerMove) this.fingerMove.style.transform = 'scale(1.1) translateY(5px)';
        }

        // ジャンプボタンの演出
        if (jumpPressed) {
            if (this.jumpBtn) {
                this.jumpBtn.style.transform = 'scale(0.9)';
                this.jumpBtn.style.background = 'rgba(255, 255, 255, 0.9)';
            }
            if (this.fingerJump) this.fingerJump.style.transform = 'scale(1.0) translateY(0)';
        } else {
            if (this.jumpBtn) {
                this.jumpBtn.style.transform = 'scale(1.0)';
                this.jumpBtn.style.background = 'rgba(255, 255, 255, 0.5)';
            }
            if (this.fingerJump) this.fingerJump.style.transform = 'scale(1.1) translateY(5px)';
        }

        // --- Contextの更新 ---
        if (isMoving) {
            demo.context.moveVector.set(inputX, -inputY);
        } else {
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

    cleanup: function(htpManager) {
        this.stick = null; 
        this.arrow = null; 
        this.fingerMove = null;
        this.jumpBtn = null; 
        this.fingerJump = null;
    }
};
