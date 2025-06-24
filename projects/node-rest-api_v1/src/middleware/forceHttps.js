// Middleware для перенаправлення на HTTPS
function forceHttps(useHttps = false) {
    return (req, res, next) => {
        if (useHttps && !req.secure) {
            const httpsUrl = `https://${req.hostname}${req.url}`;
            // return res.redirect(301, httpsUrl);
            return res.redirect(httpsUrl);
        }
        next();
    };
}

export default forceHttps;