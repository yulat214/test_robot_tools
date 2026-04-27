import { useEffect, useRef, useState } from 'react';
import * as ROSLIB from 'roslib';

export function useROS(jointTopic: string) {
  const [rosStatus, setRosStatus] = useState<string>('Disconnected');
  
  // 描画ループ内で参照・更新するためのRef
  const jointPositionsRef = useRef<Map<string, number>>(new Map());
  const cmdVelRef = useRef({ linearX: 0, angularZ: 0 });
  const needsUpdateRef = useRef(false);
  const rosRef = useRef<ROSLIB.Ros | null>(null);

  useEffect(() => {
    const hostname = window.location.hostname;
    const ros = new ROSLIB.Ros({ url: `ws://${hostname}:9090` });
    rosRef.current = ros;

    ros.on('connection', () => setRosStatus('Connected'));
    ros.on('error', () => setRosStatus('Error'));
    ros.on('close', () => setRosStatus('Disconnected'));

    // ジョイント状態の購読
    const jointListener = new ROSLIB.Topic({
      ros: ros,
      name: jointTopic,
      messageType: 'sensor_msgs/msg/JointState'
    });

    jointListener.subscribe((message: any) => {
      for (let i = 0; i < message.name.length; i++) {
        jointPositionsRef.current.set(message.name[i], message.position[i]);
      }
      needsUpdateRef.current = true;
    });

    // 速度指令の購読
    const cmdVelListener = new ROSLIB.Topic({
      ros: ros,
      name: '/cmd_vel',
      messageType: 'geometry_msgs/msg/Twist'
    });

    cmdVelListener.subscribe((message: any) => {
      cmdVelRef.current = {
        linearX: message.linear.x,
        angularZ: message.angular.z
      };
    });

    return () => {
      jointListener.unsubscribe();
      cmdVelListener.unsubscribe();
      ros.close();
    };
  }, [jointTopic]);

  const publishScan = (scanData: any) => {
    if (!rosRef.current || !rosRef.current.isConnected) return;

    const scanTopic = new ROSLIB.Topic({
      ros: rosRef.current,
      name: '/scan',
      messageType: 'sensor_msgs/msg/LaserScan'
    });

    const message = {
      header: {
        stamp: { sec: Math.floor(Date.now() / 1000), nanosec: 0 },
        frame_id: 'base_scan'
      },
      ...scanData
    };

    scanTopic.publish(message);
  };

  return { rosStatus, jointPositionsRef, cmdVelRef, needsUpdateRef, publishScan };
}