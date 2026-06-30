// =====================================
// input.js
// タッチ・マウス操作の入力制御
// ★ネット(🕸️)に乗っている間のジャンプ禁止を実装
// =====================================

function setupInputs() {
    joystickBase = document.getElementById('joystick-base');
    joystickStick = document.getElementById('joystick-stick');
    jumpBtn = document.getElementById('jump-btn');

    if (!jumpBtn) return;

    jumpBtn.addEventListener('mousedown', doJump);
    jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); doJump(); }, { passive: false });
    
    document.addEventListener('mousedown', onPointerDownPC);
    document.addEventListener('mousemove', onPointerMovePC);
    document.addEventListener('mouseup', onPointerUpPC);
    
    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
}

function doJump() { 
    // ★追加: ネットに乗って遅延効果を受けている間はジャンプさせない
    if (window.ItemSystem && window.ItemSystem.isOnNet) return;

    const canFly = window.ItemSystem && window.ItemSystem.isFlyMode;
    
    if (!isJumping || canFly) { 
        isJumping = true; 
        
        // フライ中は少しジャンプ力を高めて連続で飛びやすくする
        if (canFly) {
            verticalVelocity = typeof jumpPower !== 'undefined' ? jumpPower * 1.2 : 0.4;
        } else {
            verticalVelocity = typeof jumpPower !== 'undefined' ? jumpPower : 0.3; 
        }
        
        if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
            window.MultiplayerManager.forceSendPos();
        }
    } 
}

let isMouseDown = false;

function onPointerDownPC(e) {
    if (e.target.id === 'jump-btn' || e.target.id === 'item-slot') return;
    if (e.target.tagName.toLowerCase() === 'canvas' || e.target.id === 'ui-layer') {
        isMouseDown = true; startX = e.clientX; startY = e.clientY; showJoystick(startX, startY);
    }
}
function onPointerMovePC(e) { if (isMouseDown) updateJoystick(e.clientX, e.clientY); }
function onPointerUpPC(e) { isMouseDown = false; hideJoystick(); }

function onTouchStart(e) {
    if (e.target.id === 'jump-btn' || e.target.id === 'item-slot') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (joystickTouchId === null) {
            joystickTouchId = touch.identifier; startX = touch.clientX; startY = touch.clientY;
            showJoystick(startX, startY); break;
        }
    }
}
function onTouchMove(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) { updateJoystick(touch.clientX, touch.clientY); break; }
    }
}
function onTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) { joystickTouchId = null; hideJoystick(); break; }
    }
}

function showJoystick(x, y) {
    if(!joystickBase) return;
    joystickBase.style.display = 'block'; joystickBase.style.left = x + 'px'; joystickBase.style.top = y + 'px';
    joystickStick.style.transform = `translate(-50%, -50%)`;
}
function updateJoystick(currentX, currentY) {
    if(!joystickBase) return;
    let dx = currentX - startX, dy = currentY - startY;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), maxRadius);
    const angle = Math.atan2(dy, dx), stickX = distance * Math.cos(angle), stickY = distance * Math.sin(angle);
    joystickStick.style.transform = `translate(calc(-50% + ${stickX}px), calc(-50% + ${stickY}px))`;
    moveVector.set(stickX / maxRadius, stickY / maxRadius);
}
function hideJoystick() { 
    if(joystickBase) joystickBase.style.display = 'none'; 
    moveVector.set(0, 0); 
}
