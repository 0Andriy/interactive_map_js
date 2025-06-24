import logger from '../utils/logger.js'

function globalErrorHandler(err, req, res, next) {
    logger.error(err)

    err.statusCode = err.statusCode || 500
    err.status = err.status || 'error'

    res.status(err.statusCode).json({
        statusCode: err.statusCode,
        message: err.message || 'Something went wrong',
        // error: err,
    })
}

export default globalErrorHandler
