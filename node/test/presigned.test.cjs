const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

// Run the real resource and AWS presigner with only the FiveM globals replaced.
const source = ts.transpileModule(readFileSync(path.join(__dirname, '../src/index.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText

const s3 = {
    LB_S3_BUCKET: 'media',
    LB_S3_REGION: 'us-east-1',
    LB_S3_ACCESS_KEY_ID: 'test-access-key',
    LB_S3_SECRET_ACCESS_KEY: 'test-secret-key'
}

function loadResource(convars) {
    const registered = new Map()
    vm.runInNewContext(source, {
        require,
        process: { env: {} },
        URL,
        crypto: require('node:crypto'),
        GetResourcePath: () => path.join(__dirname, '../..'),
        GetCurrentResourceName: () => 'lb-presigned',
        GetConvar: (name, fallback) => convars[name] ?? fallback,
        exports: (name, callback) => registered.set(name, callback)
    })
    assert.deepEqual([...registered.keys()], ['GeneratePresignedUrl'])
    return registered.get('GeneratePresignedUrl')
}

for (const endpoint of ['https://s3.example.com', 'http://192.0.2.1:9000/', 's3.example.com']) {
    test(`RustFS path-style upload and read URLs: ${endpoint}`, async () => {
        const generate = loadResource({ ...s3, LB_S3_ENDPOINT: endpoint })
        const result = await generate('image/webp')
        assert.deepEqual(Object.keys(result).sort(), ['fileUrl', 'presignedUrl'])
        const upload = new URL(result.presignedUrl)
        const base = new URL(endpoint.startsWith('http') ? endpoint : `https://${endpoint}`)
        assert.equal(upload.origin, base.origin)
        assert.match(upload.pathname, /^\/media\/[\da-f-]{36}\.webp$/)
        assert.equal(result.fileUrl, `${upload.origin}${upload.pathname}`)
        assert.equal(upload.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256')
        assert.equal(upload.searchParams.get('X-Amz-Expires'), '60')
        assert.match(upload.searchParams.get('X-Amz-Credential'), /\/us-east-1\/s3\/aws4_request$/)
        assert.match(upload.searchParams.get('X-Amz-Signature'), /^[\da-f]{64}$/)
        assert.equal(upload.searchParams.has('x-amz-checksum-crc32'), false)
        assert.equal(upload.searchParams.has('x-amz-sdk-checksum-algorithm'), false)
    })
}

test('RustFS supports a separate public bucket URL and signing region', async () => {
    const generate = loadResource({ ...s3, LB_S3_REGION: 'eu-central-1', LB_S3_ENDPOINT: 'https://s3.example.com', LB_S3_DOMAIN: 'https://cdn.example.com/media/' })
    const result = await generate('video/mp4')
    const upload = new URL(result.presignedUrl)
    assert.match(upload.searchParams.get('X-Amz-Credential'), /\/eu-central-1\/s3\/aws4_request$/)
    assert.equal(result.fileUrl, `https://cdn.example.com${upload.pathname}`)
    assert.equal(upload.host, 's3.example.com')
})

test('AWS S3 without a custom endpoint retains its URLs', async () => {
    const result = await loadResource(s3)('image/png')
    const upload = new URL(result.presignedUrl)
    assert.equal(upload.host, 'media.s3.us-east-1.amazonaws.com')
    assert.equal(result.fileUrl, `${upload.origin}${upload.pathname}`)
})

test('R2 retains priority and ignores the custom S3 endpoint', async () => {
    const result = await loadResource({
        ...s3,
        LB_S3_ENDPOINT: 'https://s3.example.com?invalid=true',
        LB_R2_BUCKET: 'r2-media',
        LB_R2_ACCOUNT_ID: 'test-account',
        LB_R2_ACCESS_KEY_ID: 'test-r2-access-key',
        LB_R2_SECRET_ACCESS_KEY: 'test-r2-secret-key',
        LB_R2_DOMAIN: 'https://cdn.example.com'
    })('image/png')
    const upload = new URL(result.presignedUrl)
    assert.match(upload.host, /test-account\.r2\.cloudflarestorage\.com$/)
    assert.equal(result.fileUrl, `https://cdn.example.com/${upload.pathname.split('/').pop()}`)
    assert.match(upload.searchParams.get('X-Amz-Credential'), /^test-r2-access-key\/.*\/auto\/s3\/aws4_request$/)
})

test('invalid custom endpoint URLs fail during initialization', () => {
    for (const endpoint of ['ftp://s3.example.com', 'https://s3.example.com?query=1', 'https://s3.example.com/#fragment', 'https://user:secret@s3.example.com']) {
        assert.throws(() => loadResource({ ...s3, LB_S3_ENDPOINT: endpoint }), /LB_S3_ENDPOINT/)
    }
})

test('missing credentials and invalid MIME types retain validation', async () => {
    assert.throws(() => loadResource({}), /No storage provider configured/)
    const generate = loadResource({ ...s3, LB_S3_ENDPOINT: 'https://s3.example.com' })
    for (const mime of ['', undefined, 42, 'invalid/type']) {
        await assert.rejects(generate(mime), /Invalid mime type/)
    }
})
