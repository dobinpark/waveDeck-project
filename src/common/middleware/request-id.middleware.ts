import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

// AsyncLocalStorage for storing request context (like requestId)
export const als = new AsyncLocalStorage<{ requestId: string }>();

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction) {
        let requestId: string;
        const headerValue = req.headers['x-request-id'];

        if (Array.isArray(headerValue)) {
            requestId = headerValue[0] || uuidv4(); // Use the first element or generate
        } else {
            requestId = headerValue || uuidv4(); // Use the header value or generate
        }

        req['requestId'] = requestId;
        res.setHeader('X-Request-Id', requestId);

        als.run({ requestId }, () => {
            next();
        });
    }
}
