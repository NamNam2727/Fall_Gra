// =====================================
// htp_minigame.js
// あそびかた：3. ミニゲーム (申請、受信・変更、観戦モード)
// サブフォルダ (htp_pages) から動的に読み込まれます
// =====================================

window.HTP_Minigame = {
    modeIdx: 0,
    modes: ['propose', 'receive', 'spectate'],

    // UI要素の参照
    mgBtn: null, mgList: null, mgItem: null,
    mgDetail: null, mgApply: null, mgPopup: null,
    btnJoin: null, btnDecline: null, finger: null,
    stick: null, arrow: null, fingerMove: null,
    specBtnGroup: null, specUpBtn: null, specDownBtn: null, fingerJump: null,

    init: function(container, htpManager) {
        // --- デモ空間専用のCSS ---
        const style = document.createElement('style');
        style.innerHTML = `
            .htp-sub-panel { display: none; flex-direction: column; flex: 1; }
            .htp-sub-panel.active { display: flex; }
            
            .htp-demo-jump {
                position: absolute; bottom: 10px; right: 15px; width: 60px; height: 60px;
                background: rgba(255, 255, 255, 0.5); border: 2px solid rgba(255, 255, 255, 0.8); 
                border-radius: 50%; color: #333; font-weight: bold; font-family: sans-serif; font-size: 12px;
                display: flex; justify-content: center; align-items: center;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3); z-index: 10; transition: transform 0.1s, background 0.1s;
            }
            
            /* ★観戦モード用のボタンだけ角丸からはみ出ないよう overflow:hidden を設定 */
            #htp-demo-spec-btn { overflow: hidden; }
            .htp-demo-spec-btn-part { flex: 1; width: 100%; display: flex; justify-content: center; align-items: center; font-size: 18px; transition: background 0.1s; }
        `;
        container.appendChild(style);

        // UIのDOM構造を生成
        container.innerHTML += `
            <div class="htp-demo-area" style="position: relative;">
                <div id="htp-demo-canvas-container"></div>
                
                <!-- ジョイスティック (3ページ目の観戦モードで使用) -->
                <div class="htp-demo-joystick-base" style="display:none;" id="htp-demo-joystick-base">
                    <div class="htp-demo-arrow" id="htp-demo-arrow"></div>
                    <div class="htp-demo-joystick-stick" id="htp-demo-stick">
                        <div class="htp-demo-finger" id="htp-demo-finger-move" style="top:15px; left:10px;">👆</div>
                    </div>
                </div>
                
                <!-- 観戦モード用 昇降ボタン (3ページ目用) -->
                <div class="htp-demo-jump" id="htp-demo-spec-btn" style="display:none; padding:0; flex-direction:column;">
                    <div class="htp-demo-spec-btn-part" id="htp-demo-spec-up" style="border-bottom: 2px solid rgba(0,0,0,0.2);">🔺</div>
                    <div class="htp-demo-spec-btn-part" id="htp-demo-spec-down">🔻</div>
                </div>
                <div class="htp-demo-finger" id="htp-demo-finger-jump" style="bottom:10px; right:15px; display:none; z-index:15;">👆</div>

                <!-- ミニゲームボタン（右上） -->
                <div id="htp-demo-mg-btn" style="position: absolute; right: 10px; top: 10px; padding: 6px 12px; background: rgba(255, 150, 0, 0.85); border: 2px solid rgba(255, 255, 255, 0.9); border-radius: 8px; color: white; font-weight: bold; font-family: sans-serif; font-size: 12px; z-index: 10; transition: background 0.2s, transform 0.1s; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                    ミニゲーム
                </div>
                
                <!-- リストウィンドウ (1ページ目) -->
                <div id="htp-demo-mg-list" style="display:none; position: absolute; top: 25px; left: 15%; width: 70%; height: 140px; background: rgba(20, 20, 30, 0.95); border: 2px solid rgba(255,255,255,0.8); border-radius: 8px; z-index: 20; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    <div style="padding: 5px; border-bottom: 1px solid #555; color: white; text-align: center; font-size: 13px; font-weight: bold;">ミニゲームを選択</div>
                    <div style="flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 5px;">
                        <div id="htp-demo-mg-item" style="background: rgba(255,255,255,0.15); border-radius: 4px; padding: 6px 10px; display: flex; align-items: center; color: white; font-size: 13px; font-weight: bold; transition: transform 0.1s, background 0.1s; border: 1px solid #555;">
                            <div style="font-size: 20px; margin-right: 10px;">🎮</div>
                            <div>崩壊サバイバル</div>
                        </div>
                    </div>
                </div>

                <!-- 詳細ウィンドウ (1ページ目) -->
                <div id="htp-demo-mg-detail" style="display:none; position: absolute; top: 25px; left: 15%; width: 70%; height: 140px; background: rgba(20, 20, 30, 0.95); border: 2px solid rgba(255,255,255,0.8); border-radius: 8px; z-index: 20; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">
                    <div style="padding: 5px; border-bottom: 1px solid #555; color: white; text-align: center; font-size: 13px; font-weight: bold;">崩壊サバイバル</div>
                    <div style="flex: 1; padding: 8px; color: #ccc; font-size: 11px; line-height: 1.4;">
                        歩いた足場が崩壊していく中、落下せずに最後まで生き残れ！
                    </div>
                    <div style="padding: 8px;">
                        <div id="htp-demo-mg-apply" style="background: #4CAF50; color: white; padding: 8px; text-align: center; border-radius: 4px; font-weight: bold; font-size: 12px; transition: transform 0.1s;">この設定で申請する</div>
                    </div>
                </div>

                <!-- ポップアップウィンドウ (2ページ目) -->
                <div id="htp-demo-mg-popup" style="display:none; position: absolute; top: 15px; left: 10%; width: 80%; height: 160px; background: rgba(30, 20, 20, 0.95); border: 2px solid #ff4444; border-radius: 8px; z-index: 20; flex-direction: column; box-shadow: 0 5px 15px rgba(0,0,0,0.5); padding: 10px; font-family: sans-serif; text-align: center; box-sizing: border-box;">
                    <div style="color: #ffaa00; font-size: 14px; font-weight: bold; margin-bottom: 5px;">🎮 ゲーム開始申請</div>
                    <div style="font-size: 16px; color: white; font-weight: bold; margin-bottom: 5px;">崩壊サバイバル</div>
                    <div style="font-size: 11px; color: #ccc; background: rgba(0,0,0,0.5); padding: 4px; border-radius: 4px; margin-bottom: 10px;">制限時間: 3分 | アイテム: 1個</div>
                    <div style="display: flex; gap: 8px; margin-top: auto;">
                        <button id="htp-demo-btn-join" style="flex: 1; padding: 8px; font-size: 12px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; color: white; background: #4CAF50; transition: transform 0.1s;">参加する</button>
                        <button id="htp-demo-btn-decline" style="flex: 1; padding: 8px; font-size: 12px; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; color: white; background: #f44336; transition: transform 0.1s;">参加しない</button>
                    </div>
                </div>

                <!-- 汎用 指アイコン -->
                <div class="htp-demo-finger" id="htp-demo-finger-ui" style="position: absolute; z-index: 30; font-size: 32px; transition: left 0.4s ease-out, top 0.4s ease-out, transform 0.1s, opacity 0.2s; opacity: 0; pointer-events: none;">👆</div>
            </div>
            
            <!-- 1. 申請パネル -->
            <div id="htp-panel-propose" class="htp-sub-panel active">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">ミニゲームの申請</div>
                    <div>
                        画面右上の「ミニゲーム」ボタンを押すと、遊べるゲームのリストが表示されます。<br><br>
                        遊びたいゲームを選び、「この設定で申請する」ボタンを押すと、同じ部屋のみんなに募集が送られます。<br><br>
                        <span style="color:#00ffff; font-weight:bold;">他ユーザーの参加が決まるか、他に参加者が存在する状態で60秒が経過したら、自動的にゲームを開始します。</span><br>
                        <span style="color:#ffaa00; font-size: 12px; font-weight:bold;">※ただし、プレイヤーが自分1人の場合は、シングルプレイとして直ちに開始することができます。</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <div></div> <!-- 左寄せ用ダミー -->
                    <button class="htp-nav-btn" onclick="HTP_Minigame.changeMode(1)">参加の受付と変更 ▶</button>
                </div>
            </div>

            <!-- 2. 受信パネル -->
            <div id="htp-panel-receive" class="htp-sub-panel">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">参加の受付と変更</div>
                    <div>
                        誰かがミニゲームを申請すると、画面にポップアップが表示されます。<br>
                        「参加する」「参加しない（観戦モード）」のどちらかを選んでください。<br><br>
                        <span style="color:#00ffff; font-weight:bold;">選んだ後も、他ユーザーが選択を終えていない（受付時間中）であれば、右上の「ゲーム詳細」ボタンを押すことで、再度ポップアップを開いて参加状態を切り替えることが可能です。</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" onclick="HTP_Minigame.changeMode(-1)">◀ まえへ</button>
                    <button class="htp-nav-btn" onclick="HTP_Minigame.changeMode(1)">観戦モードについて ▶</button>
                </div>
            </div>

            <!-- 3. 観戦モードパネル -->
            <div id="htp-panel-spectate" class="htp-sub-panel">
                <div class="htp-desc-area">
                    <div class="htp-desc-title">観戦モードについて</div>
                    <div>
                        観戦モードは、ミニゲームに参加しなかったり、ミニゲームからリタイアした場合に移行します。<br><br>
                        キャラクターは半透明になり、他のプレイヤーからは見えず、ゲームに干渉することができなくなります。<br><br>
                        ジャンプボタンが「🔺上昇」と「🔻下降」ボタンに切り替わり、<span style="color:#00ffff; font-weight:bold;">重力を無視して自由に空中を移動することが可能です！</span><br><br>
                        <span style="color:#ffaa00; font-size: 12px; font-weight:bold;">※ミニゲームが終了すると、観戦モードも自動的に終了します。</span>
                    </div>
                </div>
                <div class="htp-page-footer">
                    <button class="htp-nav-btn back" onclick="HTP_Minigame.changeMode(-1)">◀ まえへ</button>
                    <div></div>
                </div>
            </div>
        `;

        // UI要素の参照を取得
        this.mgBtn = document.getElementById('htp-demo-mg-btn');
        this.mgList = document.getElementById('htp-demo-mg-list');
        this.mgItem = document.getElementById('htp-demo-mg-item');
        this.mgDetail = document.getElementById('htp-demo-mg-detail');
        this.mgApply = document.getElementById('htp-demo-mg-apply');
        this.mgPopup = document.getElementById('htp-demo-mg-popup');
        this.btnJoin = document.getElementById('htp-demo-btn-join');
        this.btnDecline = document.getElementById('htp-demo-btn-decline');
        this.finger = document.getElementById('htp-demo-finger-ui');
        
        // 観戦モード用UI
        this.stickBase = document.getElementById('htp-demo-joystick-base');
        this.stick = document.getElementById('htp-demo-stick');
        this.arrow = document.getElementById('htp-demo-arrow');
        this.fingerMove = document.getElementById('htp-demo-finger-move');
        this.specBtnGroup = document.getElementById('htp-demo-spec-btn');
        this.specUpBtn = document.getElementById('htp-demo-spec-up');
        this.specDownBtn = document.getElementById('htp-demo-spec-down');
        this.fingerJump = document.getElementById('htp-demo-finger-jump');

        this.switchMode(0, htpManager);
        htpManager.startDemo();
    },

    changeMode: function(dir) {
        let newIdx = this.modeIdx + dir;
        if (newIdx >= 0 && newIdx < this.modes.length) {
            this.switchMode(newIdx, window.HowToPlay);
        }
    },

    switchMode: function(idx, htpManager) {
        this.modeIdx = idx;
        const mode = this.modes[idx];

        document.querySelectorAll('.htp-sub-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`htp-panel-${mode}`).classList.add('active');

        // UIの初期化
        this.mgBtn.style.display = 'block';
        this.mgBtn.style.transform = 'scale(1)';
        this.mgBtn.innerText = 'ミニゲーム';
        this.mgBtn.style.background = 'rgba(255, 150, 0, 0.85)';
        this.mgList.style.display = 'none';
        this.mgDetail.style.display = 'none';
        this.mgPopup.style.display = 'none';
        this.mgItem.style.transform = 'scale(1)';
        this.mgApply.style.transform = 'scale(1)';
        this.btnJoin.style.transform = 'scale(1)';
        this.btnDecline.style.transform = 'scale(1)';
        this.finger.style.opacity = '0';
        
        if (mode === 'spectate') {
            // 観戦モードのセットアップ
            this.mgBtn.style.display = 'none'; 
            this.stickBase.style.display = 'block';
            this.specBtnGroup.style.display = 'flex';
            this.fingerMove.style.display = 'block';
            
            htpManager.demo.context.isSpectatorMode = true;
            
            // プレイヤーを半透明にする
            htpManager.demo.player.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => { m.transparent = true; m.opacity = 0.4; m.needsUpdate = true; });
                }
            });
            
            // 空中に浮かせる
            htpManager.demo.player.position.set(0, 15, 0);
            
            // カメラを追従させる
            htpManager.demo.context.cameraAngle = 0;
            htpManager.demo.context.cameraDistance = 8;
            htpManager.demo.context.cameraHeight = 5;
            
        } else {
            // 申請・受信モードのセットアップ
            this.stickBase.style.display = 'none';
            this.specBtnGroup.style.display = 'none';
            this.fingerJump.style.display = 'none';
            
            htpManager.demo.context.isSpectatorMode = false;
            
            // 半透明を解除
            htpManager.demo.player.traverse((child) => {
                if (child.isMesh && child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => { m.transparent = false; m.opacity = 1.0; m.needsUpdate = true; });
                }
            });
            
            // 3D空間の初期化 (常に正面を向かせて固定)
            htpManager.demo.context.moveVector.set(0, 0);
            const targetAngle = Math.PI; 
            const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
            htpManager.demo.player.quaternion.copy(rotQuat);
            htpManager.demo.context.currentFacingAngle = targetAngle;
            
            htpManager.demo.context.cameraAngle = 0;
            htpManager.demo.context.cameraDistance = 10;
            htpManager.demo.context.cameraHeight = 6;
            htpManager.demo.player.position.set(0, 20, 0); 
        }
    },

    updateScenario: function(time, delta, demo) {
        const mode = this.modes[this.modeIdx];
        if (mode === 'propose') this.updatePropose(time, delta, demo);
        else if (mode === 'receive') this.updateReceive(time, delta, demo);
        else if (mode === 'spectate') this.updateSpectate(time, delta, demo);
    },

    // ------------------------------------------
    // シナリオ1：ミニゲームの申請
    // ------------------------------------------
    updatePropose: function(time, delta, demo) {
        demo.context.moveVector.set(0, 0);
        demo.context.cameraAngle = 0;
        demo.context.cameraDistance = 10;
        demo.context.cameraHeight = 6;

        const cycle = time % 6.0;

        if (cycle < 0.1) {
            this.mgBtn.style.transform = 'scale(1)';
            this.mgBtn.innerText = 'ミニゲーム';
            this.mgBtn.style.background = 'rgba(255, 150, 0, 0.85)';
            this.mgList.style.display = 'none';
            this.mgDetail.style.display = 'none';
            this.mgItem.style.transform = 'scale(1)';
            this.mgItem.style.background = 'rgba(255,255,255,0.15)';
            this.mgApply.style.transform = 'scale(1)';
            
            this.finger.style.opacity = '0';
            this.finger.style.top = '100px';
            this.finger.style.left = '50%';
            this.finger.style.transform = 'scale(1.1)';
        }
        else if (cycle >= 0.5 && cycle < 1.0) {
            this.finger.style.opacity = '1';
            this.finger.style.top = '25px';
            this.finger.style.left = 'calc(100% - 60px)';
        }
        else if (cycle >= 1.0 && cycle < 1.2) {
            this.finger.style.transform = 'scale(0.9)';
            this.mgBtn.style.transform = 'scale(0.9)';
        }
        else if (cycle >= 1.2 && cycle < 2.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.mgBtn.style.transform = 'scale(1)';
            this.mgList.style.display = 'flex';
            
            this.finger.style.top = '75px';
            this.finger.style.left = '50%';
        }
        else if (cycle >= 2.0 && cycle < 2.2) {
            this.finger.style.transform = 'scale(0.9)';
            this.mgItem.style.transform = 'scale(0.95)';
            this.mgItem.style.background = 'rgba(255,255,255,0.3)';
        }
        else if (cycle >= 2.2 && cycle < 3.5) {
            this.finger.style.transform = 'scale(1.1)';
            this.mgItem.style.transform = 'scale(1)';
            this.mgList.style.display = 'none';
            this.mgDetail.style.display = 'flex';

            this.finger.style.top = '145px';
            this.finger.style.left = '50%';
        }
        else if (cycle >= 3.5 && cycle < 3.7) {
            this.finger.style.transform = 'scale(0.9)';
            this.mgApply.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 3.7 && cycle < 4.5) {
            this.finger.style.transform = 'scale(1.1)';
            this.mgApply.style.transform = 'scale(1)';
            this.mgDetail.style.display = 'none';
            this.finger.style.opacity = '0';
            
            this.mgBtn.innerText = 'ゲーム詳細';
            this.mgBtn.style.background = 'rgba(50, 150, 255, 0.9)';
        }
    },

    // ------------------------------------------
    // シナリオ2：参加の受付と変更
    // ------------------------------------------
    updateReceive: function(time, delta, demo) {
        demo.context.moveVector.set(0, 0);
        demo.context.cameraAngle = 0;
        demo.context.cameraDistance = 10;
        demo.context.cameraHeight = 6;

        const cycle = time % 8.0;

        if (cycle < 0.1) {
            this.mgBtn.style.transform = 'scale(1)';
            this.mgBtn.innerText = 'ミニゲーム';
            this.mgBtn.style.background = 'rgba(255, 150, 0, 0.85)';
            
            this.mgPopup.style.display = 'flex';
            this.btnJoin.style.transform = 'scale(1)';
            this.btnDecline.style.transform = 'scale(1)';

            this.finger.style.opacity = '0';
            this.finger.style.top = '180px'; 
            this.finger.style.left = '25%';  
            this.finger.style.transform = 'scale(1.1)';
        }
        else if (cycle >= 0.5 && cycle < 1.2) {
            this.finger.style.opacity = '1';
            this.finger.style.top = '135px'; 
            this.finger.style.left = '25%'; 
        }
        else if (cycle >= 1.2 && cycle < 1.4) {
            this.finger.style.transform = 'scale(0.9)';
            this.btnJoin.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 1.4 && cycle < 2.5) {
            this.finger.style.transform = 'scale(1.1)';
            this.btnJoin.style.transform = 'scale(1)';
            this.mgPopup.style.display = 'none';
            
            this.mgBtn.innerText = 'ゲーム詳細';
            this.mgBtn.style.background = 'rgba(50, 150, 255, 0.9)';

            this.finger.style.top = '25px';
            this.finger.style.left = 'calc(100% - 60px)'; 
        }
        else if (cycle >= 2.5 && cycle < 2.7) {
            this.finger.style.transform = 'scale(0.9)';
            this.mgBtn.style.transform = 'scale(0.9)';
        }
        else if (cycle >= 2.7 && cycle < 4.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.mgBtn.style.transform = 'scale(1)';
            this.mgPopup.style.display = 'flex';

            this.finger.style.top = '135px';
            this.finger.style.left = '75%'; 
        }
        else if (cycle >= 4.0 && cycle < 4.2) {
            this.finger.style.transform = 'scale(0.9)';
            this.btnDecline.style.transform = 'scale(0.95)';
        }
        else if (cycle >= 4.2 && cycle < 5.0) {
            this.finger.style.transform = 'scale(1.1)';
            this.btnDecline.style.transform = 'scale(1)';
            this.mgPopup.style.display = 'none';
            this.finger.style.opacity = '0';
        }
    },

    // ------------------------------------------
    // シナリオ3：観戦モード
    // ------------------------------------------
    updateSpectate: function(time, delta, demo) {
        const cycle = time % 10.0;
        let inputX = 0, inputY = 0; 
        let upPressed = false, downPressed = false;
        let moveTouching = false, isMoving = false;

        if (cycle > 0.5 && cycle <= 2.5) {
            inputX = 0; inputY = 1.0; 
            isMoving = true; moveTouching = true;
        } else if (cycle > 3.0 && cycle <= 5.0) {
            upPressed = true;
        } else if (cycle > 5.5 && cycle <= 7.5) {
            inputX = 0.707; inputY = 0.707; 
            isMoving = true; moveTouching = true;
        } else if (cycle > 8.0 && cycle <= 10.0) {
            downPressed = true;
        }

        if ((cycle > 0.3 && cycle <= 0.5) || (cycle > 5.3 && cycle <= 5.5)) moveTouching = true;

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
        }

        if (moveTouching) {
            if (this.fingerMove) this.fingerMove.style.transform = 'scale(1.0) translateY(0)';
        } else {
            if (this.fingerMove) this.fingerMove.style.transform = 'scale(1.1) translateY(5px)';
        }

        const flySpeed = 20.0;
        if (upPressed) {
            demo.player.position.y += flySpeed * delta;
            this.specUpBtn.style.background = 'rgba(255, 255, 255, 0.9)';
            this.fingerJump.style.display = 'block';
            this.fingerJump.style.bottom = '40px';
            this.fingerJump.style.transform = 'scale(1.0)';
        } else {
            this.specUpBtn.style.background = 'transparent';
        }

        if (downPressed) {
            demo.player.position.y -= flySpeed * delta;
            this.specDownBtn.style.background = 'rgba(255, 255, 255, 0.9)';
            this.fingerJump.style.display = 'block';
            this.fingerJump.style.bottom = '10px';
            this.fingerJump.style.transform = 'scale(1.0)';
        } else {
            this.specDownBtn.style.background = 'transparent';
        }

        if (!upPressed && !downPressed) {
            this.fingerJump.style.display = 'none';
        }

        if (demo.player.position.y < 1.0) demo.player.position.y = 1.0;
        if (demo.player.position.y > 40.0) demo.player.position.y = 40.0;
    },

    onWarp: function(warpX, warpZ) {
    },

    cleanup: function(htpManager) {
        htpManager.demo.player.traverse((child) => {
            if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => { m.transparent = false; m.opacity = 1.0; m.needsUpdate = true; });
            }
        });
        
        htpManager.demo.context.isSpectatorMode = false;
        htpManager.demo.context.cameraDistance = 8;
        htpManager.demo.context.cameraHeight = 5;

        this.mgBtn = null; this.mgList = null; this.mgItem = null;
        this.mgDetail = null; this.mgApply = null; this.mgPopup = null;
        this.btnJoin = null; this.btnDecline = null; this.finger = null;
        this.stickBase = null; this.stick = null; this.arrow = null; this.fingerMove = null;
        this.specBtnGroup = null; this.specUpBtn = null; this.specDownBtn = null; this.fingerJump = null;
    }
};


