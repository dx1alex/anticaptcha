"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const request = require("request");
class Anticaptcha {
    constructor(options, name) {
        this.pause = 3000;
        this.services = Array.isArray(options) ? options : [options];
        if (name) {
            this.use(name);
        }
        else {
            this.service = this.services[0];
        }
    }
    get key() {
        return this.service.key;
    }
    get name() {
        return this.service.name;
    }
    get host() {
        return this.service.host;
    }
    use(name) {
        const service = this.services.find(v => v.name === name);
        if (!service) {
            throw new Error(`anticaptcha: service "${name}" not found`);
        }
        return this.service = service;
    }
    next() {
        const i = this.services.findIndex(v => v.name === this.name);
        this.service = this.services[i == this.services.length - 1 ? 0 : i + 1];
        return this.service;
    }
    addService(options) {
        const services = Array.isArray(options) ? options : [options];
        this.services = this.services.concat(services);
    }
    async send(options, name) {
        const service = name ? this.services.find(v => v.name === name) : this.service;
        const formData = Object.assign({}, { key: service.key }, options);
        if (typeof formData.file === 'string') {
            formData.file = fs.createReadStream(formData.file);
        }
        if (formData.body) {
            formData.body = encodeURIComponent(formData.body);
        }
        const res = await new Promise((resolve, reject) => {
            request.post({ url: `${service.host}/in.php`, formData }, (err, response, body) => {
                if (err) {
                    return reject(err);
                }
                resolve(body);
            });
        });
        const [, id] = res.match(/^OK\|(\d+)$/) || [, ,];
        if (!id) {
            const error = new Error(`anticaptcha: "${service.name}" ${res}`);
            error['code'] = res;
            throw error;
        }
        return id;
    }
    /**
     * Запрос текста капчи
     * Запрос состояния капчи необходимо выполнять в течение 300 секунд после загрузки.
     * После 300 секунд API будет возвращать ошибку ERROR_NO_SUCH_CAPCHA_ID
     */
    async getId(id, name) {
        const service = name ? this.services.find(v => v.name === name) : this.service;
        const res = await new Promise((resolve, reject) => {
            request.get(`${service.host}/res.php?key=${service.key}&action=get&id=${id}`, (err, response, body) => {
                if (err) {
                    return reject(err);
                }
                resolve(body);
            });
        });
        if (res === 'CAPCHA_NOT_READY')
            return null;
        const [, code] = res.match(/^OK\|(.+)$/) || [, ,];
        if (!code) {
            const error = new Error(`anticaptcha: "${service.name}" ${res}`);
            error['code'] = res;
            throw error;
        }
        return code;
    }
    async recognize(options, name) {
        name = name || this.service.name;
        const id = await this.send(options, name);
        const start = Date.now();
        for (let i = 0; i < 300000 / this.pause; i++) {
            await sleep(this.pause);
            let code = await this.getId(id, name);
            if (code)
                return { id, code, name, time: Date.now() - start };
        }
        const res = 'CAPTCHA_NOT_RECOGNIZE';
        const error = new Error(`anticaptcha: "${name}" ${res}`);
        error['code'] = res;
        throw error;
    }
    bad(id, name) {
        const service = name ? this.services.find(v => v.name === name) : this.service;
        return new Promise((resolve, reject) => {
            request.get(`${service.host}/res.php?key=${service.key}&action=reportbad&id=${id}`, (err, response, body) => {
                if (err) {
                    return reject(err);
                }
                resolve(body);
            });
        });
    }
    ballance(name) {
        const service = name ? this.services.find(v => v.name === name) : this.service;
        return new Promise((resolve, reject) => {
            request.get(`${service.host}/res.php?key=${service.key}&action=getbalance`, (err, response, body) => {
                if (err) {
                    return reject(err);
                }
                resolve(+body);
            });
        });
    }
}
exports.Anticaptcha = Anticaptcha;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
