import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use((request, response, next) => {
    const incomingRequestId =
      typeof request.header === "function"
        ? request.header("X-Request-Id")?.trim()
        : "";
    const requestId = incomingRequestId || randomUUID();
    response.setHeader("X-Request-Id", requestId);
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );
  app.enableCors({
    origin: true,
    credentials: false,
    exposedHeaders: ["X-Request-Id"],
  });
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
