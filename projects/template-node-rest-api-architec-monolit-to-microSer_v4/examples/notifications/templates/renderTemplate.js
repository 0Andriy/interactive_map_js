// notifications/templates/renderTemplate.js

import fs from 'fs/promises'
import path from 'path'
import Handlebars from 'handlebars'

/**
 * Рендер окремої частини шаблону (subject, body, html)
 * @param {'email'|'sms'|'push'} type
 * @param {string} name - Назва шаблону
 * @param {'subject'|'body'|'html'} part - Частина шаблону
 * @param {Object} data - Дані
 * @returns {Promise<string>}
 */
export async function renderTemplatePart(type, name, part, data) {
    const filePath = path.resolve(`notifications/templates/${type}/${name}.${part}.hbs`)
    const source = await fs.readFile(filePath, 'utf8')
    const template = Handlebars.compile(source)
    return template(data)
}
