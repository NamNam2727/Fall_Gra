// =====================================
// main.js
// =====================================

let mapMesh;
let raycaster = new THREE.Raycaster();
let downVector = new THREE.Vector3(0, -1, 0);

function initThreeJS() {
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
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1); 
    
    updatePlayer(delta);
    
    if (window.MultiplayerManager) {
        window.MultiplayerManager.update(delta);
    }
    
    updateCamera(false);
    renderer.render(scene, camera);
}

function updatePlayer(delta) {
    const rotationSpeed = 12; 
    
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
        let rayOffsetHeight = typeof playerRadius !== 'undefined' ? playerRadius * 3 : 3.0;
        let origin = new THREE.Vector3(player.position.x, player.position.y + rayOffsetHeight, player.position.z);
        
        raycaster.set(origin, downVector);
        let intersects = raycaster.intersectObject(mapMesh, false);
        
        if (intersects.length > 0) {
            currentGroundY = intersects[0].point.y;
            groundNormal.copy(intersects[0].face.normal);
            let normalMatrix = new THREE.Matrix3().getNormalMatrix(mapMesh.matrixWorld);
            groundNormal.applyMatrix3(normalMatrix).normalize();
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

        // ★修正: 段差の許容値を小さく（厳しく）し、判定位置を「進行方向の先端」にオフセット
        let myStepHeight = 0.6; // 1ブロック分(1.0)は登れない高さにする
        let rayOffsetHeight = typeof playerRadius !== 'undefined' ? playerRadius * 3 : 3.0;
        let margin = (typeof playerRadius !== 'undefined' ? playerRadius : 1.0) * 0.8; 

        // X軸方向の段差・壁判定
        let canMoveX = true;
        if (Math.abs(mX) > 0.001 && mapMesh) {
            let checkX = nextX + Math.sign(mX) * margin; // 進行方向の手前で判定
            raycaster.set(new THREE.Vector3(checkX, player.position.y + rayOffsetHeight, player.position.z), downVector);
            let interX = raycaster.intersectObject(mapMesh, false);
            if (interX.length > 0 && interX[0].point.y > player.position.y + myStepHeight) {
                canMoveX = false; 
            }
        }
        if (canMoveX) player.position.x = nextX;

        // Z軸方向の段差・壁判定
        let canMoveZ = true;
        if (Math.abs(mZ) > 0.001 && mapMesh) {
            let checkZ = nextZ + Math.sign(mZ) * margin;
            raycaster.set(new THREE.Vector3(player.position.x, player.position.y + rayOffsetHeight, checkZ), downVector);
            let interZ = raycaster.intersectObject(mapMesh, false);
            if (interZ.length > 0 && interZ[0].point.y > player.position.y + myStepHeight) {
                canMoveZ = false; 
            }
        }
        if (canMoveZ) player.position.z = nextZ;

        const targetRotationY = Math.atan2(moveDirection.x, moveDirection.y);
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetRotationY);
        
        // ★修正: 接地している(isJumping === false)時のみ、地面の法線に従って傾ける
        const effectiveNormal = isJumping ? new THREE.Vector3(0, 1, 0) : groundNormal;
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
        // ★停止中の傾きも同様に修正
        const currentRotY = new THREE.Euler().setFromQuaternion(player.quaternion, 'YXZ').y;
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), currentRotY);
        const effectiveNormal = isJumping ? new THREE.Vector3(0, 1, 0) : groundNormal;
        const tiltQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), effectiveNormal);
        player.quaternion.slerp(tiltQuat.multiply(rotQuat), rotationSpeed * delta);
    }

    if (isJumping) {
        verticalVelocity += gravity * delta;
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
        // ★修正: 下り坂でカクカクしないように、落下判定の許容値を少し広げる（0.8）
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
        let myRadius = typeof playerRadius !== 'undefined' ? playerRadius : 1.0;
        
        for (let id in others) {
            let other = others[id];
            if (other.mesh) {
                let dx = player.position.x - other.mesh.position.x;
                let dz = player.position.z - other.mesh.position.z;
                let dy = player.position.y - other.mesh.position.y;
                let distXZ = Math.hypot(dx, dz);
                
                let combinedRadius = myRadius * 1.8; 
                
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
}

function updateCamera(instant) {
    const targetCamPos = new THREE.Vector3(
        player.position.x + Math.sin(cameraAngle) * cameraDistance,
        player.position.y + cameraHeight, 
        player.position.z + Math.cos(cameraAngle) * cameraDistance
    );
    if (instant) camera.position.copy(targetCamPos);
    else camera.position.lerp(targetCamPos, 0.1);
    camera.lookAt(player.position);
}
