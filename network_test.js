const https = require('https');
const http = require('http');
const dns = require('dns').promises;

async function testNetworkPerformance() {
    console.log('🌐 Network Performance Test\n');
    
    // Test DNS resolution
    console.log('1. Testing DNS Resolution...');
    const startTime = Date.now();
    try {
        await dns.lookup('discord.com');
        const dnsTime = Date.now() - startTime;
        console.log(`✅ DNS Resolution: ${dnsTime}ms`);
    } catch (error) {
        console.log('❌ DNS Resolution failed:', error.message);
    }
    
    // Test Discord API connectivity
    console.log('\n2. Testing Discord API Connectivity...');
    const discordStart = Date.now();
    
    return new Promise((resolve) => {
        const req = https.request('https://discord.com/api/v10/gateway', {
            method: 'GET',
            timeout: 10000
        }, (res) => {
            const discordTime = Date.now() - discordStart;
            console.log(`✅ Discord API: ${discordTime}ms (Status: ${res.statusCode})`);
            
            // Test gateway endpoint
            testGatewayEndpoint().then(() => {
                resolve();
            });
        });
        
        req.on('error', (error) => {
            console.log('❌ Discord API failed:', error.message);
            resolve();
        });
        
        req.on('timeout', () => {
            console.log('❌ Discord API timeout');
            req.destroy();
            resolve();
        });
        
        req.end();
    });
}

async function testGatewayEndpoint() {
    console.log('\n3. Testing Discord Gateway...');
    const gatewayStart = Date.now();
    
    return new Promise((resolve) => {
        const req = https.request('https://discord.com/api/v10/gateway/bot', {
            method: 'GET',
            timeout: 10000
        }, (res) => {
            const gatewayTime = Date.now() - gatewayStart;
            console.log(`✅ Discord Gateway: ${gatewayTime}ms (Status: ${res.statusCode})`);
            
            // Performance assessment
            console.log('\n📊 Performance Assessment:');
            if (gatewayTime < 100) {
                console.log('🟢 Excellent connectivity');
            } else if (gatewayTime < 200) {
                console.log('🟡 Good connectivity');
            } else if (gatewayTime < 500) {
                console.log('🟠 Moderate connectivity issues');
            } else {
                console.log('🔴 Poor connectivity - consider server location or network optimization');
            }
            
            resolve();
        });
        
        req.on('error', (error) => {
            console.log('❌ Discord Gateway failed:', error.message);
            resolve();
        });
        
        req.on('timeout', () => {
            console.log('❌ Discord Gateway timeout');
            req.destroy();
            resolve();
        });
        
        req.end();
    });
}

// Run the test
testNetworkPerformance().then(() => {
    console.log('\n✨ Network test completed!');
    console.log('\n💡 Tips for better WebSocket performance:');
    console.log('• Ensure your server is geographically close to Discord\'s servers');
    console.log('• Check for network congestion or firewall issues');
    console.log('• Consider using a CDN or proxy if latency is high');
    console.log('• Monitor your server\'s CPU and memory usage');
    console.log('• Keep your bot\'s cache size optimized');
});
