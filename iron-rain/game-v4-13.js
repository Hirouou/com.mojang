function loop(t){const dt=Math.min(.04,(t-last)/1000||0);last=t;update(dt*.72);draw();requestAnimationFrame(loop)}
resize();setup();reset();requestAnimationFrame(loop);
