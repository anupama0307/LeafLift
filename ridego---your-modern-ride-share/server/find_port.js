const { execSync } = require('child_process');

try {
    const output = execSync('netstat -ano').toString();
    const nodePids = execSync('tasklist /FI "IMAGENAME eq node.exe" /NH').toString()
        .split('\n')
        .map(line => line.trim().split(/\s+/)[1])
        .filter(pid => pid && !isNaN(pid));

    console.log('Node PIDs:', nodePids);

    const lines = output.split('\n');
    lines.forEach(line => {
        if (line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const port = parts[1];
            const pid = parts[4];
            if (nodePids.includes(pid)) {
                console.log(`Node (PID ${pid}) is listening on ${port}`);
            }
        }
    });
} catch (e) {
    console.error(e);
}
