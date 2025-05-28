export const sendResponse = (
    res,
    { success = true, status = 200, message = '', data = null, meta = {} } = {},
) => {
    res.status(status).json({
        success,
        status,
        timestamp: new Date().toISOString(),
        message,
        data,
        meta,
    })
}

export const sendError = (
    res,
    { status = 500, message = 'Виникла помилка', errors = null, meta = {} } = {},
) => {
    res.status(status).json({
        success: false,
        status,
        timestamp: new Date().toISOString(),
        message,
        errors,
        meta,
    })
}
