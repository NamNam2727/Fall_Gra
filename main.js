// =====================================
// ★追加: 地面判定を関数化
// =====================================
function getGroundInfo(terrainMeshes, playerPosition, pRadius, myStepHeight) {
    let currentGroundY = -100;
    let groundNormal = new THREE.Vector3(0, 1, 0);

    if (terrainMeshes.length > 0) {
        let origin = new THREE.Vector3(playerPosition.x, playerPosition.y + pRadius * 3.0, playerPosition.z);
        raycaster.set(origin, downVector);
        let intersects = raycaster.intersectObjects(terrainMeshes, false);

        for (let i = 0; i < intersects.length; i++) {
            let hitNormal = intersects[i].face.normal.clone();
            // ★変更: 複数のメッシュが対象になるため、当たったオブジェクトの matrixWorld を使用する
            let normalMatrix = new THREE.Matrix3().getNormalMatrix(intersects[i].object.matrixWorld);
            hitNormal.applyMatrix3(normalMatrix).normalize();

            if (hitNormal.y > 0.3) {
                if (intersects[i].point.y <= playerPosition.y + myStepHeight + 0.5) {
                    currentGroundY = intersects[i].point.y;
                    groundNormal.copy(hitNormal);
                    break;
                }
            }
        }
    }

    return { currentGroundY, groundNormal };
}


// =====================================
// ★変更: updatePlayer関数
// 処理順を「移動 → 地面再取得 → 重力・姿勢更新」に変更
// =====================================
window.updatePlayer = function(delta) {
    const rotationSpeed = 12; 
    let pRadius = typeof playerRadius !== 'undefined' ? playerRadius : 1.2;
    let myStepHeight = typeof stepHeight !== 'undefined' ? stepHeight : 1.5;
    
    // 1. UI更新
    if (player.chatTimer > 0) {
        player.chatTimer -= delta;
        if (player.chatTimer <= 0 && player.chatSprite) {
            player.remove(player.chatSprite);
            if (player.chatSprite.material.map) player.chatSprite.material.map.dispose();
            player.chatSprite.material.dispose();
            player.chatSprite = null;
        }
    }

    // 2. terrainMeshes取得
    // ★変更: 動的に有効な地形メッシュ群を取得
    let terrainMeshes = getTerrainMeshes();

    // ・updatePlayer()開始時の地面Ray取得
    let groundInfo = getGroundInfo(terrainMeshes, player.position, pRadius, myStepHeight);
    let currentGroundY = groundInfo.currentGroundY;
    let groundNormal = groundInfo.groundNormal;

    // 3. 入力から mX,mZ 計算
    let mX = 0, mZ = 0;

    if (moveVector.lengthSq() > 0.01) {
        const camForwardX = -Math.sin(cameraAngle), camForwardZ = -Math.cos(cameraAngle);
        const camRightX = Math.cos(cameraAngle), camRightZ = -Math.sin(cameraAngle);

        const moveDirX = camRightX * moveVector.x + camForwardX * (-moveVector.y);
        const moveDirZ = camRightZ * moveVector.x + camForwardZ * (-moveVector.y);
        const moveDirection = new THREE.Vector2(moveDirX, moveDirZ).normalize();
        const inputLength = Math.min(moveVector.length(), 1.0);
        
        mX = moveDirection.x * (inputLength * moveSpeed) * delta;
        mZ = moveDirection.y * (inputLength * moveSpeed) * delta;

        const targetRotationY = Math.atan2(moveDirection.x, moveDirection.y);
        currentFacingAngle = targetRotationY; 
        
        if (moveVector.y <= 0.2 && Math.abs(moveVector.x) > 0.05) {
            let targetCameraAngle = targetRotationY + Math.PI;
            let diff = targetCameraAngle - cameraAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            cameraAngle += diff * 3.0 * delta;
        }
    }

    // 4. 水平壁判定
    // 5. XZ移動
    const nextX = player.position.x + mX;
    const nextZ = player.position.z + mZ;
    let margin = pRadius * 0.8; 
    let wallCheckY = player.position.y + myStepHeight * 0.8; 
    let headCheckY = player.position.y + pRadius * 1.8; 

    let canMoveX = true;
    if (Math.abs(mX) > 0.001 && terrainMeshes.length > 0) {
        let dirX = new THREE.Vector3(Math.sign(mX), 0, 0);
        let checkOrigins = [
            new THREE.Vector3(player.position.x, wallCheckY, player.position.z),
            new THREE.Vector3(player.position.x, headCheckY, player.position.z)
        ];

        for (let origin of checkOrigins) {
            raycaster.set(origin, dirX);
            let interX = raycaster.intersectObjects(terrainMeshes, false);
            if (interX.length > 0 && interX[0].distance < margin + Math.abs(mX)) {
                let normal = interX[0].face.normal.clone();
                let normalMatrix = new THREE.Matrix3().getNormalMatrix(interX[0].object.matrixWorld);
                normal.applyMatrix3(normalMatrix).normalize();
                
                if (normal.y < 0.6) {
                    canMoveX = false;
                    break;
                }
            }
        }
    }
    if (canMoveX) player.position.x = nextX;

    let canMoveZ = true;
    if (Math.abs(mZ) > 0.001 && terrainMeshes.length > 0) {
        let dirZ = new THREE.Vector3(0, 0, Math.sign(mZ));
        let checkOrigins = [
            new THREE.Vector3(player.position.x, wallCheckY, player.position.z),
            new THREE.Vector3(player.position.x, headCheckY, player.position.z)
        ];

        for (let origin of checkOrigins) {
            raycaster.set(origin, dirZ);
            let interZ = raycaster.intersectObjects(terrainMeshes, false);
            if (interZ.length > 0 && interZ[0].distance < margin + Math.abs(mZ)) {
                let normal = interZ[0].face.normal.clone();
                let normalMatrix = new THREE.Matrix3().getNormalMatrix(interZ[0].object.matrixWorld);
                normal.applyMatrix3(normalMatrix).normalize();
                
                if (normal.y < 0.6) {
                    canMoveZ = false;
                    break;
                }
            }
        }
    }
    if (canMoveZ) player.position.z = nextZ;

    // 6. 移動後の座標で地面Ray再取得
    // 7. currentGroundY 更新
    // 8. groundNormal 更新
    groundInfo = getGroundInfo(terrainMeshes, player.position, pRadius, myStepHeight);
    currentGroundY = groundInfo.currentGroundY;
    groundNormal = groundInfo.groundNormal;

    // 9. ジャンプ・重力・着地判定
    // =====================================
    // ★観戦モード時のドローン化（重力無視）
    // =====================================
    if (window.isSpectatorMode) {
        const flySpeed = 20.0;
        if (window.specMoveUp) player.position.y += flySpeed * delta;
        if (window.specMoveDown) player.position.y -= flySpeed * delta;
        
        // 奈落制限
        if (player.position.y < -30) player.position.y = 20;

        verticalVelocity = 0; 
        isJumping = false; 
    } else {
        // 通常のフライ(連続ジャンプ)中の天井衝突判定・重力処理
        if (isJumping) {
            verticalVelocity += gravity * delta;
            
            // 上昇中のみ天井をチェックする
            if (verticalVelocity > 0 && terrainMeshes.length > 0) {
                let upRayOrigin = new THREE.Vector3(player.position.x, player.position.y + pRadius * 1.5, player.position.z);
                let upRay = new THREE.Raycaster(upRayOrigin, new THREE.Vector3(0, 1, 0));
                let upHits = upRay.intersectObjects(terrainMeshes, false);
                
                if (upHits.length > 0 && upHits[0].distance < pRadius * 1.0) {
                    verticalVelocity = 0; 
                }
            }

            player.position.y += verticalVelocity * delta;
            
            if (verticalVelocity < 0 && player.position.y <= currentGroundY) {
                player.position.y = currentGroundY; 
                isJumping = false; 
                verticalVelocity = 0;
                
                if (window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
                    window.MultiplayerManager.forceSendPos();
                }
            }
        } else {
            // ★変更: ジャンプ開始判定の厳密化（上方向へ吸着中＝verticalVelocity > 0 はジャンプしない）
            const groundGap = player.position.y - currentGroundY;
            if (groundGap > 0.8 && verticalVelocity <= 0) { 
                // ★追加: 坂進入時の誤判定調査用デバッグログ
                console.log({
                    groundY: currentGroundY,
                    playerY: player.position.y,
                    gap: groundGap,
                    verticalVelocity: verticalVelocity
                });

                isJumping = true; 
                verticalVelocity = 0; 
            } else {
                player.position.y += (currentGroundY - player.position.y) * 0.3;
            }
        }
        
        if (player.position.y < -30) {
            player.position.set(0, 20, 0); 
            isJumping = true; 
            verticalVelocity = 0;
            
            // ★追加: ミニゲームプレイ中に落下した場合は強制リタイア(敗北・観戦モード移行)
            if (window.MinigameManager && window.MinigameManager.state === 'PLAYING') {
                if (!window.isSpectatorMode) {
                    window.MinigameManager.executeRetire();
                }
            }
        }
    }

    // 10. Quaternion更新（最新の groundNormal を使用）
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), currentFacingAngle);
    const effectiveNormal = (!isJumping && !window.isSpectatorMode) ? groundNormal : new THREE.Vector3(0, 1, 0);
    const tiltQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), effectiveNormal);
    player.quaternion.slerp(tiltQuat.multiply(rotQuat), rotationSpeed * delta);


    // 11. 他プレイヤー押し出し
    // =====================================
    // ★他プレイヤーとの押し出し処理（安定版の構造）
    // レイキャストによる壁判定の【後】に処理することで、すり抜け・トンネリングを完全防止
    // =====================================
    let isFalling = (isJumping && player.position.y > currentGroundY + 3.0);

    if (window.MultiplayerManager && !isFalling && !window.isSpectatorMode) {
        const others = window.MultiplayerManager.otherPlayers;
        for (let id in others) {
            let other = others[id];
            // 相手が観戦モード、または初回ワープ前なら押し出し判定をスルー
            if (other.mesh && other.hasReceivedFirstPos !== false && !other.isSpectator) {
                let dx = player.position.x - other.mesh.position.x;
                let dz = player.position.z - other.mesh.position.z;
                let dy = player.position.y - other.mesh.position.y;
                
                let distXZ = Math.hypot(dx, dz);
                let combinedRadius = pRadius * 1.8; 
                
                if (distXZ < combinedRadius && dy > -0.2 && dy < 0.8) {
                    if (distXZ === 0) { 
                        dx = (Math.random() - 0.5) * 0.1;
                        dz = (Math.random() - 0.5) * 0.1;
                        distXZ = Math.hypot(dx, dz);
                    }
                    
                    let overlap = combinedRadius - distXZ;
                    
                    if (Math.abs(dy) < 0.4) {
                        player.position.x += (dx / distXZ) * overlap * 0.5;
                        player.position.z += (dz / distXZ) * overlap * 0.5;
                    } else if (dy >= 0.4) {
                        let slideForce = overlap * 0.15; 
                        player.position.x += (dx / distXZ) * slideForce;
                        player.position.z += (dz / distXZ) * slideForce;
                    }
                }
            }
        }
    }
};
