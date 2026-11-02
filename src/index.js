const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/qr', (req, res) => {
    const qrPath = path.join(__dirname, 'qrcode.png');
    if (fs.existsSync(qrPath)) {
        // Impede o navegador de guardar a imagem antiga no cache
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.sendFile(qrPath);
    } else {
        res.send('<h1>QR Code ainda nao gerado. Aguarde...</h1><script>setTimeout(() => location.reload(), 3000);</script>');
    }
});

app.get('/', (req, res) => {
    res.send('<h1>Bot Clean Tech esta rodando!</h1><p>Acesse <a href="/qr">/qr</a> para escanear o QR Code.</p>');
});

app.listen(PORT, () => {
    console.log(`Servidor web rodando na porta ${PORT}`);
});
