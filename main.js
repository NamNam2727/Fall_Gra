// =====================================
// main.js
// 水平Raycasterを用いた正確な壁・坂道判定と姿勢制御
// ★ マップ生成のタイミングを同期レイヤーの完了後、または一番最初の入室時に完全に分離しました
// =====================================

window.mapMesh = null; // グローバルなマップメッシュ参照
let raycaster = new THREE.Raycaster();
let downVector = new THREE.Vector3(0, -1, 0);

window.currentFacingAngle = 0; 

// ==========================================
// 本編用コンテキスト
// ==========================================
window.mainContext = {
    get player() { return player; },
    get scene() { return scene; },
    get camera() { return camera; },
    get moveVector() { return moveVector; },
    get isJumping() { return isJumping; },
    set isJumping(v) { isJumping = v; },
    get verticalVelocity() { return verticalVelocity; },
    set verticalVelocity(v) { verticalVelocity = v; },
    get cameraAngle() { return cameraAngle; },
    set cameraAngle(v) { cameraAngle = v; },
    get currentFacingAngle() { return window.currentFacingAngle; },
    set currentFacingAngle(v) { window.currentFacingAngle = v; },
    get cameraSliderValue() { return window.cameraSliderValue; },
    set cameraSliderValue(v) { window.cameraSliderValue = v; },
    get isCameraAuto() { return window.isCameraAuto; },
    get isSpectatorMode() { return window.isSpectatorMode; },
    isDemo: false
};

function getTerrainMeshes(ctx) {
    let meshes = [];
    if (!ctx || !ctx.scene) return meshes;
    ctx.scene.children.forEach(c => {
        if (c.visible) {
            if (c.userData && c.userData.isTerrain) {
                meshes.push(c);
            } else if (c.isGroup) {
                c.children.forEach(child => {
                    if (child.visible && child.userData && child.userData.isTerrain) {
                        meshes.push(child);
                    }
                });
            }
        }
    });
    return meshes;
}

window.initThreeJS = function() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 150);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(30, 60, 30);
    dirLight.castShadow = true;
    const d = 60;
    dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.mapSize.width = 1024; dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    initPlayer();
    
    // ★ 修正: ここでは即座にマップを作らず、入室順によって分岐させる
    if (window.MultiplayerManager) {
        window.MultiplayerManager.initExistingPlayers();
        
        // 自分以外に人がいれば「後から入室した」と判定
        const isLateJoin = Object.keys(window.MultiplayerManager.otherPlayers).length > 0;
        
        if (isLateJoin) {
            // 同期レイヤーを出し、マップを作らずに待機
            window.MultiplayerManager.startSync();
        } else {
            // 自分が最初の一人なら、フェードなしで即座に初期マップを作る
            if (window.MapManager && typeof window.MapManager.setupInitialMap === 'function') {
                window.MapManager.setupInitialMap('default');
            }
            setTimeout(() => {
                window.MultiplayerManager.requestPositions();
                window.MultiplayerManager.forceSendPos(); 
            }, 1000);
        }
    } else {
        // オフライン・エラー時は即座に初期マップを作る
        if (window.MapManager && typeof window.MapManager.setupInitialMap === 'function') {
            window.MapManager.setupInitialMap('default');
        }
    }

    window.addEventListener('keydown', (e) => {
        if (window.isSpectatorMode) {
            if (e.code === 'Space') window.specMoveUp = true;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') window.specMoveDown = true;
        }
    });
    window.addEventListener('keyup', (e) => {
        if (window.isSpectatorMode) {
            if (e.code === 'Space') window.specMoveUp = false;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') window.specMoveDown = false;
        }
    });

    updateCamera(true, 0.016);
    window.addEventListener('resize', onWindowResize);
};

window.onWindowResize = function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
};

window.animate = function() {
    requestAnimationFrame(window.animate);
    
    // ★追加: 途中入室の同期画面中はキャラクター等を動かさず完全に停止させる
    if (window.MultiplayerManager && window.MultiplayerManager.isSyncing) {
        return;
    }
    
    const rawDelta = clock.getDelta();
    const delta = Math.min(rawDelta, 0.05); 
    
    updatePlayer(delta);
    
    if (window.MultiplayerManager) {
        window.MultiplayerManager.update(delta);
    }

    if (window.MinigameManager && typeof window.MinigameManager.update === 'function') {
        window.MinigameManager.update(delta);
    }
    
    updateCamera(false, delta);
    renderer.render(scene, camera);
};

function getGroundInfo(terrainMeshes, playerPosition, pRadius, myStepHeight) {
    let currentGroundY = -100;
    let groundNormal = new THREE.Vector3(0, 1, 0);

    if (terrainMeshes.length > 0) {
        let rayHeight = 2.5; 
        let origin = new THREE.Vector3(playerPosition.x, playerPosition.y + rayHeight, playerPosition.z);
        raycaster.set(origin, downVector);
        let intersects = raycaster.intersectObjects(terrainMeshes, false);

        for (let i = 0; i < intersects.length; i++) {
            let hitNormal = intersects[i].face.normal.clone();
            let normalMatrix = new THREE.Matrix3().getNormalMatrix(intersects[i].object.matrixWorld);
            hitNormal.applyMatrix3(normalMatrix).normalize();

            if (hitNormal.y > 0.3) {
                if (intersects[i].point.y <= playerPosition.y + myStepHeight + 1.5) {
                    currentGroundY = intersects[i].point.y;
                    groundNormal.copy(hitNormal);
                    break;
                }
            }
        }
    }
    return { currentGroundY, groundNormal };
}

window.updatePlayer = function(delta, ctx = window.mainContext) {
    const rotationSpeed = 12; 
    let pRadius = typeof playerRadius !== 'undefined' ? playerRadius : 1.2;
    let myStepHeight = typeof stepHeight !== 'undefined' ? stepHeight : 1.5;
    
    if (!ctx.isDemo && ctx.player && ctx.player.chatTimer > 0) {
        ctx.player.chatTimer -= delta;
        if (ctx.player.chatTimer <= 0 && ctx.player.chatSprite) {
            ctx.player.remove(ctx.player.chatSprite);
            if (ctx.player.chatSprite.material.map) ctx.player.chatSprite.material.map.dispose();
            ctx.player.chatSprite.material.dispose();
            ctx.player.chatSprite = null;
        }
    }

    let terrainMeshes = getTerrainMeshes(ctx);
    let groundInfo = getGroundInfo(terrainMeshes, ctx.player.position, pRadius, myStepHeight);
    let currentGroundY = groundInfo.currentGroundY;
    let groundNormal = groundInfo.groundNormal;

    let mX = 0, mZ = 0;

    if (ctx.moveVector.lengthSq() > 0.01) {
        const camForwardX = -Math.sin(ctx.cameraAngle), camForwardZ = -Math.cos(ctx.cameraAngle);
        const camRightX = Math.cos(ctx.cameraAngle), camRightZ = -Math.sin(ctx.cameraAngle);

        const moveDirX = camRightX * ctx.moveVector.x + camForwardX * (-ctx.moveVector.y);
        const moveDirZ = camRightZ * ctx.moveVector.x + camForwardZ * (-ctx.moveVector.y);
        const moveDirection = new THREE.Vector2(moveDirX, moveDirZ).normalize();
        const inputLength = Math.min(ctx.moveVector.length(), 1.0);
        
        let mSpeed = typeof moveSpeed !== 'undefined' ? moveSpeed : 16.0;
        mX = moveDirection.x * (inputLength * mSpeed) * delta;
        mZ = moveDirection.y * (inputLength * mSpeed) * delta;

        const targetRotationY = Math.atan2(moveDirection.x, moveDirection.y);
        ctx.currentFacingAngle = targetRotationY; 
        
        if (ctx.moveVector.y <= 0.2 && Math.abs(ctx.moveVector.x) > 0.05) {
            let targetCameraAngle = targetRotationY + Math.PI;
            let diff = targetCameraAngle - ctx.cameraAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            ctx.cameraAngle += diff * 3.0 * delta;
        }
    }

    let isFalling = (ctx.isJumping && ctx.player.position.y > currentGroundY + 3.0);

    if (!ctx.isDemo && window.MultiplayerManager && !isFalling && !ctx.isSpectatorMode) {
        const others = window.MultiplayerManager.otherPlayers;
        for (let id in others) {
            let other = others[id];
            if (other.mesh && other.hasReceivedFirstPos !== false && !other.isSpectator) {
                let dx = ctx.player.position.x - other.mesh.position.x;
                let dz = ctx.player.position.z - other.mesh.position.z;
                let dy = ctx.player.position.y - other.mesh.position.y;
                
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
                        mX += (dx / distXZ) * overlap * 0.5;
                        mZ += (dz / distXZ) * overlap * 0.5;
                    } else if (dy >= 0.4) {
                        let slideForce = overlap * 0.15; 
                        mX += (dx / distXZ) * slideForce;
                        mZ += (dz / distXZ) * slideForce;
                    }
                }
            }
        }
    }

    const nextX = ctx.player.position.x + mX;
    const nextZ = ctx.player.position.z + mZ;
    let margin = pRadius * 0.8; 
    let wallCheckY = ctx.player.position.y + myStepHeight * 0.8; 
    let headCheckY = ctx.player.position.y + pRadius * 1.8; 

    let canMoveX = true;
    if (Math.abs(mX) > 0.001 && terrainMeshes.length > 0) {
        let dirX = new THREE.Vector3(Math.sign(mX), 0, 0);
        let checkOrigins = [
            new THREE.Vector3(ctx.player.position.x, wallCheckY, ctx.player.position.z),
            new THREE.Vector3(ctx.player.position.x, headCheckY, ctx.player.position.z)
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
    if (canMoveX) ctx.player.position.x = nextX;

    let canMoveZ = true;
    if (Math.abs(mZ) > 0.001 && terrainMeshes.length > 0) {
        let dirZ = new THREE.Vector3(0, 0, Math.sign(mZ));
        let checkOrigins = [
            new THREE.Vector3(ctx.player.position.x, wallCheckY, ctx.player.position.z),
            new THREE.Vector3(ctx.player.position.x, headCheckY, ctx.player.position.z)
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
    if (canMoveZ) ctx.player.position.z = nextZ;

    groundInfo = getGroundInfo(terrainMeshes, ctx.player.position, pRadius, myStepHeight);
    currentGroundY = groundInfo.currentGroundY;
    groundNormal = groundInfo.groundNormal;

    if (ctx.isSpectatorMode) {
        const flySpeed = 20.0;
        if (!ctx.isDemo && window.specMoveUp) ctx.player.position.y += flySpeed * delta;
        if (!ctx.isDemo && window.specMoveDown) ctx.player.position.y -= flySpeed * delta;
        
        if (ctx.player.position.y < -30) ctx.player.position.y = 20;

        ctx.verticalVelocity = 0; 
        ctx.isJumping = false; 
    } else {
        if (ctx.isJumping) {
            let grav = typeof gravity !== 'undefined' ? gravity : -60.0;
            ctx.verticalVelocity += grav * delta;
            
            if (ctx.verticalVelocity > 0 && terrainMeshes.length > 0) {
                let upRayOrigin = new THREE.Vector3(ctx.player.position.x, ctx.player.position.y + pRadius * 1.5, ctx.player.position.z);
                let upRay = new THREE.Raycaster(upRayOrigin, new THREE.Vector3(0, 1, 0));
                let upHits = upRay.intersectObjects(terrainMeshes, false);
                
                if (upHits.length > 0 && upHits[0].distance < pRadius * 1.0) {
                    ctx.verticalVelocity = 0; 
                }
            }

            ctx.player.position.y += ctx.verticalVelocity * delta;
            
            if (ctx.verticalVelocity < 0 && ctx.player.position.y <= currentGroundY) {
                ctx.player.position.y = currentGroundY; 
                ctx.isJumping = false; 
                ctx.verticalVelocity = 0;
                
                if (!ctx.isDemo && window.MultiplayerManager && typeof window.MultiplayerManager.forceSendPos === 'function') {
                    window.MultiplayerManager.forceSendPos();
                }
            }
        } else {
            const groundGap = ctx.player.position.y - currentGroundY;
            if (groundGap > 1.2 && ctx.verticalVelocity <= 0) { 
                ctx.isJumping = true; 
                ctx.verticalVelocity = 0; 
            } else {
                ctx.player.position.y += (currentGroundY - ctx.player.position.y) * 0.3;
            }
        }
        
        if (ctx.player.position.y < -30) {
            if (!ctx.isDemo && window.MapManager && typeof window.MapManager.respawnPlayer === 'function') {
                window.MapManager.respawnPlayer();
            } else {
                ctx.player.position.set(0, 20, 0); 
                ctx.isJumping = true; 
                ctx.verticalVelocity = 0;
            }
            
            if (!ctx.isDemo && window.MinigameManager && window.MinigameManager.state === 'PLAYING') {
                if (!ctx.isSpectatorMode) {
                    window.MinigameManager.executeRetire();
                }
            }
        }
    }

    const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ctx.currentFacingAngle || 0);
    const effectiveNormal = (!ctx.isJumping && !ctx.isSpectatorMode) ? groundNormal : new THREE.Vector3(0, 1, 0);
    const tiltQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), effectiveNormal);
    ctx.player.quaternion.slerp(tiltQuat.multiply(rotQuat), rotationSpeed * delta);
};

function getCameraPosBySlider(val, cAngle, playerPos, ctx) {
    let baseDist = (ctx && typeof ctx.cameraDistance !== 'undefined') ? ctx.cameraDistance : (typeof cameraDistance !== 'undefined' ? cameraDistance : 5);
    let baseHeight = (ctx && typeof ctx.cameraHeight !== 'undefined') ? ctx.cameraHeight : (typeof cameraHeight !== 'undefined' ? cameraHeight : 15);
    
    let cDist, cHeight;

    if (val >= 0.1) {
        let diff = val - 0.5; 
        cHeight = baseHeight + (diff * 35.0); 
        cDist = baseDist + (diff * 15.0);     
        cHeight = Math.max(cHeight, 1.0);
        cDist = Math.max(cDist, 1.0);
    } else {
        let diff = 0.1 - 0.5; 
        let minHeight = Math.max(baseHeight + (diff * 35.0), 1.0);
        let minDist = Math.max(baseDist + (diff * 15.0), 1.0);
        
        cHeight = minHeight; 
        let t = val / 0.1;   
        cDist = 0.1 + t * (minDist - 0.1); 
    }

    return new THREE.Vector3(
        playerPos.x + Math.sin(cAngle) * cDist,
        playerPos.y + cHeight, 
        playerPos.z + Math.cos(cAngle) * cDist
    );
}

window.updateCamera = function(instant, delta = 0.016, ctx = window.mainContext) {
    let cAngle = ctx.cameraAngle || 0;
    
    if (typeof ctx.cameraSliderValue === 'undefined') {
        ctx.cameraSliderValue = 0.5;
    }

    if (ctx.isCameraAuto && typeof ctx.player !== 'undefined') {
        let terrainMeshes = getTerrainMeshes(ctx);
        if (terrainMeshes.length > 0) {
            
            let lookTarget = ctx.player.position.clone();
            lookTarget.y += 1.0; 
            
            let currentCamPos = getCameraPosBySlider(ctx.cameraSliderValue, cAngle, ctx.player.position, ctx);
            
            let upCamPos = currentCamPos.clone();
            upCamPos.y += 1.0; 
            
            let backDir = new THREE.Vector3(Math.sin(cAngle), 0, Math.cos(cAngle)).normalize();
            let backCamPos = currentCamPos.clone().add(backDir.multiplyScalar(0.8)); 
            
            let diagCamPos = currentCamPos.clone();
            diagCamPos.y += 1.0; 
            diagCamPos.add(new THREE.Vector3(Math.sin(cAngle), 0, Math.cos(cAngle)).normalize().multiplyScalar(0.8)); 
            
            let mainHit = false;
            let subHit = false;

            let dirMain = new THREE.Vector3().subVectors(currentCamPos, lookTarget);
            let distMain = dirMain.length();
            dirMain.normalize();
            raycaster.set(lookTarget, dirMain);
            let hitsMain = raycaster.intersectObjects(terrainMeshes, false);
            if (hitsMain.length > 0 && hitsMain[0].distance < distMain - 0.1) {
                mainHit = true;
            }

            let dirSubUp = new THREE.Vector3().subVectors(upCamPos, lookTarget);
            let distSubUp = dirSubUp.length();
            dirSubUp.normalize();
            raycaster.set(lookTarget, dirSubUp);
            let hitsSubUp = raycaster.intersectObjects(terrainMeshes, false);
            if (hitsSubUp.length > 0 && hitsSubUp[0].distance < distSubUp - 0.1) {
                subHit = true;
            }

            raycaster.set(currentCamPos, new THREE.Vector3(Math.sin(cAngle), 0, Math.cos(cAngle)).normalize()); 
            let hitsBack = raycaster.intersectObjects(terrainMeshes, false);
            if (hitsBack.length > 0 && hitsBack[0].distance < 0.8) {
                subHit = true;
            }
            
            let dirDiag = new THREE.Vector3().subVectors(diagCamPos, currentCamPos).normalize();
            raycaster.set(currentCamPos, dirDiag);
            let hitsDiag = raycaster.intersectObjects(terrainMeshes, false);
            if (hitsDiag.length > 0 && hitsDiag[0].distance < 1.0) {
                subHit = true;
            }

            if (mainHit) {
                ctx.cameraSliderValue -= 1.5 * delta; 
            } else if (subHit) {
                // 現状維持
            } else {
                let returnSpeed = 0.2 * delta; 
                if (ctx.cameraSliderValue > 0.5) {
                    ctx.cameraSliderValue -= returnSpeed;
                    if (ctx.cameraSliderValue < 0.5) ctx.cameraSliderValue = 0.5;
                } else if (ctx.cameraSliderValue < 0.5) {
                    ctx.cameraSliderValue += returnSpeed;
                    if (ctx.cameraSliderValue > 0.5) ctx.cameraSliderValue = 0.5;
                }
            }
            
            ctx.cameraSliderValue = Math.max(0.0, Math.min(1.0, ctx.cameraSliderValue));
            
            if (!ctx.isDemo) {
                const sliderEl = document.getElementById('camera-slider');
                if (sliderEl) {
                    sliderEl.value = ctx.cameraSliderValue * 100;
                }
            }
        }
    }

    const targetCamPos = getCameraPosBySlider(ctx.cameraSliderValue, cAngle, ctx.player.position, ctx);
    
    if (instant) ctx.camera.position.copy(targetCamPos);
    else ctx.camera.position.lerp(targetCamPos, 0.1);
    
    let lookTarget = ctx.player.position.clone();
    lookTarget.y += 1.0;
    ctx.camera.lookAt(lookTarget);
};


