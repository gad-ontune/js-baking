import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import init_db
from .routers import audit, auth, business, users

logger = logging.getLogger('jsbh.api')

MAX_BODY_BYTES = 1024 * 1024

API_SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    production = settings.is_production
    app = FastAPI(
        title=settings.app_name,
        version='1.0.0',
        lifespan=lifespan,
        docs_url=None if production else '/docs',
        redoc_url=None if production else '/redoc',
        openapi_url=None if production else '/openapi.json',
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allow_headers=['Content-Type', 'X-CSRF-Token', 'X-Request-ID'],
    )

    @app.middleware('http')
    async def limit_request_body(request: Request, call_next):
        declared = request.headers.get('content-length')
        if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
            return JSONResponse(status_code=413, content={'detail': 'Request body too large.'})

        chunks: list[bytes] = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                return JSONResponse(status_code=413, content={'detail': 'Request body too large.'})
            chunks.append(chunk)
        request._body = b''.join(chunks)
        return await call_next(request)

    @app.middleware('http')
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        for name, value in API_SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if request.url.path.startswith(settings.api_prefix):
            response.headers['Cache-Control'] = 'no-store'
        if production:
            response.headers.setdefault(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains',
            )
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Return field names and messages only. Never echo submitted values:
        # login payloads contain passwords.
        errors = [
            {
                'field': '.'.join(str(part) for part in error['loc'][1:]) or 'body',
                'message': error['msg'],
            }
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={'detail': 'Invalid request.', 'errors': errors},
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception('Unhandled API error on %s', request.url.path)
        return JSONResponse(status_code=500, content={'detail': 'Internal server error.'})

    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(users.router, prefix=settings.api_prefix)
    app.include_router(audit.router, prefix=settings.api_prefix)
    app.include_router(business.router, prefix=settings.api_prefix)

    @app.get('/health', tags=['system'])
    def health() -> dict[str, str]:
        return {'status': 'ok'}

    return app


app = create_app()
