import React, { useEffect, useRef } from 'react';

const ParticleBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // The iconic Google Antigravity aesthetic colors
    const colors = ['#2b52ff', '#e84855', '#a32059', '#3f1f70', '#ff9b71', '#4285F4']; 
    
    let particles = [];
    const numParticles = 1200; // High density for the authentic look
    
    // Virtual sphere properties
    let radius = Math.max(canvas.width, canvas.height) * 0.55; 
    
    let targetRotationX = 0;
    let targetRotationY = 0;
    let rotationX = 0;
    let rotationY = 0;

    const handleMouseMove = (e) => {
      // Mouse movement guides the rotation angle
      let x = e.clientX - canvas.width / 2;
      let y = e.clientY - canvas.height / 2;
      targetRotationY = x * 0.0015;
      targetRotationX = y * 0.0015;
    };

    window.addEventListener('mousemove', handleMouseMove);

    class Particle {
      constructor() {
        // uniformly distribute across a 3D sphere mathematical model
        this.phi = Math.acos(-1 + (2 * Math.random()));
        this.theta = Math.sqrt(numParticles * Math.PI) * this.phi;
        
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.size = Math.random() * 2 + 1; // Thickness of the dash
        this.length = Math.random() * 10 + 4; // Length of the dash
        
        // Add random scatter depth so it's a thick point-cloud, not a thin shell
        this.r = radius * (0.6 + Math.random() * 0.6); 

        // Initial base coordinates
        this.baseX = this.r * Math.cos(this.theta) * Math.sin(this.phi);
        this.baseY = this.r * Math.sin(this.theta) * Math.sin(this.phi);
        this.baseZ = this.r * Math.cos(this.phi);
      }
      
      update(rotX, rotY) {
        // Add constant slow auto-rotation on the global Y axis so it feels alive even when mouse is still
        this.theta += 0.001;
        this.baseX = this.r * Math.cos(this.theta) * Math.sin(this.phi);
        this.baseY = this.r * Math.sin(this.theta) * Math.sin(this.phi);
        this.baseZ = this.r * Math.cos(this.phi);

        let x = this.baseX;
        let y = this.baseY;
        let z = this.baseZ;

        // Apply Matrix Rotation X (Mouse Y)
        let y1 = y * Math.cos(rotX) - z * Math.sin(rotX);
        let z1 = y * Math.sin(rotX) + z * Math.cos(rotX);
        y = y1;
        z = z1;

        // Apply Matrix Rotation Y (Mouse X)
        let x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
        let z2 = -x * Math.sin(rotY) + z * Math.cos(rotY);
        x = x1;
        z = z2;

        this.x3d = x;
        this.y3d = y;
        this.z3d = z;
      }
      
      draw() {
        const perspective = radius * 2.5;
        if (this.z3d < -perspective) return; // Cull particles completely behind the camera focal point
        
        const scale = perspective / (perspective + this.z3d);
        const x2d = canvas.width / 2 + this.x3d * scale;
        const y2d = canvas.height / 2 + this.y3d * scale;
        
        ctx.save();
        ctx.translate(x2d, y2d);
        
        // Orient the dash tangentially along the curvature of the sphere
        const angle = Math.atan2(this.y3d, this.x3d) + Math.PI / 2;
        ctx.rotate(angle);
        
        ctx.beginPath();
        // Use roundRect for soft, pill-shaped dash lines
        ctx.roundRect(-this.length/2 * scale, -this.size/2 * scale, this.length * scale, this.size * scale, this.size/2 * scale);
        
        // Z-Depth Alpha Fading (Objects further back blend into the background)
        let depthAlpha = Math.max(0, Math.min(1, (this.z3d + radius * 1.5) / (radius * 3)));
        ctx.globalAlpha = depthAlpha * 0.8;
        
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
      }
    }

    const init = () => {
      particles = [];
      for (let i = 0; i < numParticles; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Smooth easing function towards the target rotation (lerp)
      rotationX += (targetRotationX - rotationX) * 0.05;
      rotationY += (targetRotationY - rotationY) * 0.05;
      
      // Update coordinates
      particles.forEach(p => p.update(rotationX, rotationY));

      // Z-Buffer Sorting (Painter's Algorithm) to draw back-to-front
      particles.sort((a,b) => b.z3d - a.z3d); 
      
      // Render
      particles.forEach(p => p.draw());

      animationFrameId = requestAnimationFrame(animate);
    };

    init();
    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      radius = Math.max(canvas.width, canvas.height) * 0.55;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: -1,
        pointerEvents: 'none'
      }} 
    />
  );
};

export default ParticleBackground;
