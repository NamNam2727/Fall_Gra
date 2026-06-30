// =====================================
// main.js
// 水平Raycasterを用いた正確な壁・坂道判定と姿勢制御
// ★フライ(連続ジャンプ)中の天井衝突判定を追加
// ★坂道での停止時にキャラクターが勝手に回転するバグを修正
// =====================================

let mapMesh;
let raycaster = new THREE.Raycaster();
let downVector = new THREE.Vector3(0, -1, 0);

// ★追加: キャラクターの水平方向の向きを記録する変数
let currentFacingAngle = 0; 

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

    if (window.MapGenerator && typeof window.MapGenerator.createMesh === 'function') {
        mapMesh = window.MapGenerator.createMesh();
        scene.add(mapMesh);
    } else {
        console.error("MapGeneratorが見つかりません。");
    }

    initPlayer();

    if (window.MultiplayerManager) {
        window.MultiplayerManager.initExistingPlayers();
        setTimeout(() => {
            window.MultiplayerManager.requestPositions();
            window.MultiplayerManager.forceSendPos(); 
        }, 1000);
    }

    updateCamera(true);
    window.addEventListener('resize', onWindowResize);
};

window.onWindowResize = function() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
};

window.animate = function() {
    requestAnimationFrame(window.animate);
    const delta = Math.min(clock.getDelta(), 0.1); 
    
    updatePlayer(delta);
    
    if (window.MultiplayerManager) {
        window.MultiplayerManager.update(delta);
    }
    
    updateCamera(false);
    renderer.render(scene, camera);
};

window.updatePlayer = function(delta) {
    const rotationSpeed = 12; 
    let pRadius = typeof playerRadius !== 'undefined' ? playerRadius : 1.0;
    let myStepHeight = typeof stepHeight !== 'undefined' ? stepHeight : 1.5;
    
    if (player.chatTimer > 0) {
        player.chatTimer -= delta;
        if (player.chatTimer <= 0 && player.chatSprite) {
            player.remove(player.chatSprite);
            if (player.chatSprite.material.map) player.chatSprite.material.map.dispose();
            player.chatSprite.material.dispose();
            player.chatSprite = null;
        }
    }

    let currentGroundY = -100;
    let groundNormal = new THREE.Vector3(0, 1, 0);
    
    if (mapMesh) {
        let origin = new THREE.Vector3(player.position.x, player.position.y + pRadius * 3.0, player.position.z);
        raycaster.set(origin, downVector);
        let intersects = raycaster.intersectObject(mapMesh, false);
        
        for (let i = 0; i < intersects.length; i++) {
            let hitNormal = intersects[i].face.normal.clone();
            let normalMatrix = new THREE.Matrix3().getNormalMatrix(mapMesh.matrixWorld);
            hitNormal.applyMatrix3(normalMatrix).normalize();
            
            if (hitNormal.y > 0.3) {
                if (intersects[i].point.y <= player.position.y + myStepHeight + 0.5) {
                    currentGroundY = intersects[i].point.y;
                    groundNormal.copy(hitNormal);
                    break;
                }
            }
        }
    }

    if (moveVector.lengthSq() > 0.01) {
        const camForwardX = -Math.sin(cameraAngle), camForwardZ = -Math.cos(cameraAngle);
        const camRightX = Math.cos(cameraAngle), camRightZ = -Math.sin(cameraAngle);
        const moveDirX = camRightX * moveVector.x + camForwardX * (-moveVector.y);
        const moveDirZ = camRightZ * moveVector.x + camForwardZ * (-moveVector.y);
        const moveDirection = new THREE.Vector2(moveDirX, moveDirZ).normalize();
        const inputLength = Math.min(moveVector.length(), 1.0);
        
        const mX = moveDirection.x * (inputLength * moveSpeed) * delta;
        const mZ = moveDirection.y * (inputLength * moveSpeed) * delta;
        const nextX = player.position.x + mX;
        const nextZ = player.position.z + mZ;

        let margin = pRadius * 0.8; 
        
        let wallCheckY = player.position.y + myStepHeight * 0.8; 
        let headCheckY = player.position.y + pRadius * 1.8; 

        let canMoveX = true;
        if (Math.abs(mX) > 0.001 && mapMesh) {
            let dirX = new THREE.Vector3(Math.sign(mX), 0, 0);
            let checkOrigins = [
                new THREE.Vector3(player.position.x, wallCheckY, player.position.z),
                new THREE.Vector3(player.position.x, headCheckY, player.position.z)
            ];

            for (let origin of checkOrigins) {
                raycaster.set(origin, dirX);
                let interX = raycaster.intersectObject(mapMesh, false);
                if (interX.length > 0 && interX[0].distance < margin + Math.abs(mX)) {
                    let normal = interX[0].face.normal.clone();
                    let normalMatrix = new THREE.Matrix3().getNormalMatrix(mapMesh.matrixWorld);
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
        if (Math.abs(mZ) > 0.001 && mapMesh) {
            let dirZ = new THREE.Vector3(0, 0, Math.sign(mZ));
            let checkOrigins = [
                new THREE.Vector3(player.position.x, wallCheckY, player.position.z),
                new THREE.Vector3(player.position.x, headCheckY, player.position.z)
            ];

            for (let origin of checkOrigins) {
                raycaster.set(origin, dirZ);
                let interZ = raycaster.intersectObject(mapMesh, false);
                if (interZ.length > 0 && interZ[0].distance < margin + Math.abs(mZ)) {
                    let normal = interZ[0].face.normal.clone();
                    let normalMatrix = new THREE.Matrix3().getNormalMatrix(mapMesh.matrixWorld);
                    normal.applyMatrix3(normalMatrix).normalize();
                    
                    if (normal.y < 0.6) {
                        canMoveZ = false;
                        break;
                    }
                }
            }
        }
        if (canMoveZ) player.position.z = nextZ;

        // キャラクターの回転と姿勢制御
        const targetRotationY = Math.atan2(moveDirection.x, moveDirection.y);
        
        // ★修正: 移動中は常に「現在向いている方角」を上書き保存する
        currentFacingAngle = targetRotationY;
        
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY);
        const effectiveNormal = !isJumping ? groundNormal : new THREE.Vector3(0, 1, 0);
        const tiltQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), effectiveNormal);
        
        const targetQuaternion = tiltQuat.multiply(rotQuat);
        player.quaternion.slerp(targetQuaternion, rotationSpeed * delta);

        if (moveVector.y <= 0.2 && Math.abs(moveVector.x) > 0.05) {
            let targetCameraAngle = targetRotationY + Math.PI;
            let diff = targetCameraAngle - cameraAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            cameraAngle += diff * 3.0 * delta;
        }
    } else {
        // ★修正: 停止中は、傾いたモデルから方角を逆算せず、保存しておいた向きを使用する
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), currentFacingAngle);
        const effectiveNormal = !isJumping ? groundNormal : new THREE.Vector3(0, 1, 0);
        const tiltQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), effectiveNormal);
        player.quaternion.slerp(tiltQuat.multiply(rotQuat), rotationSpeed * delta);
    }

    if (isJumping) {
        verticalVelocity += gravity * delta;
        
        if (verticalVelocity > 0 && mapMesh) {
            let upRayOrigin = new THREE.Vector3(player.position.x, player.position.y + pRadius * 1.5, player.position.z);
            let upRay = new THREE.Raycaster(upRayOrigin, new THREE.Vector3(0, 1, 0));
            let upHits = upRay.intersectObject(mapMesh, false);
            
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
        if (player.position.y > currentGroundY + 0.8) { 
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
    }

    if (window.MultiplayerManager) {
        const others = window.MultiplayerManager.otherPlayers;
        for (let id in others) {
            let other = others[id];
            if (other.mesh) {
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

window.updateCamera = function(instant) {
    let cAngle = typeof cameraAngle !== 'undefined' ? cameraAngle : 0;
    let baseDist = typeof cameraDistance !== 'undefined' ? cameraDistance : 5;
    let baseHeight = typeof cameraHeight !== 'undefined' ? cameraHeight : 15;

    let cDist = baseDist;
    let cHeight = baseHeight;

    if (typeof window.cameraSliderValue !== 'undefined') {
        let diff = window.cameraSliderValue - 0.5; 
        cHeight = baseHeight + (diff * 35.0); 
        cDist = baseDist + (diff * 15.0);     
        cHeight = Math.max(cHeight, 1.0);
        cDist = Math.max(cDist, 1.0);
    }

    const targetCamPos = new THREE.Vector3(
        player.position.x + Math.sin(cAngle) * cDist,
        player.position.y + cHeight, 
        player.position.z + Math.cos(cAngle) * cDist
    );
    
    if (instant) camera.position.copy(targetCamPos);
    else camera.position.lerp(targetCamPos, 0.1);
    
    let lookTarget = player.position.clone();
    lookTarget.y += 1.0;
    camera.lookAt(lookTarget);
};
