// src/features/simulator/hooks/useWorldManager.ts
import { useState, useCallback } from 'react';
import * as THREE from 'three';

// 管理するオブジェクトの型定義
export type EnvObject = {
  id: string;           // ユニークID
  name: string;         // 表示名（ファイル名など）
  mesh: THREE.Object3D; // Three.jsの実体
  sourceUrl: string;    // ロード元のパス
  position: number[];   // [x, y, z]
  rotation: number[];   // [rx, ry, rz]
};

export function useWorldManager(scene: THREE.Scene | null) {
  const [obstacles, setObstacles] = useState<EnvObject[]>([]);

  const disposeObject = (obj: THREE.Object3D) => {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });
  };

  const clearObstacles = useCallback(() => {
    if (!scene) return;
    obstacles.forEach(obj => {
      scene.remove(obj.mesh);
      disposeObject(obj.mesh);
    });
    setObstacles([]);
  }, [scene, obstacles]);

  const removeObjectById = useCallback((id: string) => {
    if (!scene) return;
    const target = obstacles.find(o => o.id === id);
    if (target) {
      scene.remove(target.mesh);
      disposeObject(target.mesh);
      setObstacles(prev => prev.filter(o => o.id !== id));
    }
  }, [scene, obstacles]);

  const addWorldModel = useCallback(async (url: string, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    if (!scene) return;
    const ext = url.split('.').pop()?.toLowerCase();
    const fileName = url.split('/').pop() || 'Unknown Model';
    let loader: any;
    
    if (ext === 'dae') {
      const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
      loader = new ColladaLoader();
    } else if (ext === 'glb' || ext === 'gltf') {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      loader = new GLTFLoader();
    }
    
    if (!loader) return;

    loader.load(url, (result: any) => {
      const mesh = ext === 'dae' ? result.scene : result.scene;
      mesh.position.set(pos[0], pos[1], pos[2]);
      mesh.rotation.set(rot[0], rot[1], rot[2]);

      mesh.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      scene.add(mesh);
      
      // ★ ID付きで状態に追加
      const newObj: EnvObject = {
        id: crypto.randomUUID(), 
        name: fileName,
        mesh: mesh,
        sourceUrl: url,
        position: pos,
        rotation: rot
      };
      
      setObstacles((prev) => [...prev, newObj]);
    });
  }, [scene]);

  const exportEnvironment = useCallback(() => {
    const exportData = {
      objects: obstacles.map(obj => ({
        name: obj.name,
        uri: obj.sourceUrl,
        pose: [...obj.position, ...obj.rotation]
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'environment_layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [obstacles]);

  const loadEnvironment = useCallback(async (data: any) => {
    if (!data || !data.objects || !Array.isArray(data.objects)) {
      console.error("Invalid environment JSON format");
      return;
    }
    clearObstacles();

    console.log(`📂 Restoring ${data.objects.length} objects...`);

    for (const obj of data.objects) {
      try {
        const pos = obj.pose.slice(0, 3);
        const rot = obj.pose.slice(3, 6);
        await addWorldModel(obj.uri, pos, rot);
      } catch (err) {
        console.error(`Failed to load object: ${obj.name}`, err);
      }
    }
    console.log('Environment restoration complete.');
  }, [clearObstacles, addWorldModel]);

  return { 
    obstacles, 
    addWorldModel, 
    removeObjectById,
    clearObstacles,
    exportEnvironment,
    loadEnvironment
  };
}