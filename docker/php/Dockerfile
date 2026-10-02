# syntax=docker/dockerfile:1
# Imagen PHP de la API. Etapas: base (común), dev (local y CI) y prod (futuro despliegue).

FROM php:8.4-fpm-alpine AS base

RUN apk add --no-cache icu-libs libpq libzip \
    && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS icu-dev libpq-dev libzip-dev linux-headers \
    && docker-php-ext-install -j"$(nproc)" intl opcache pdo_pgsql zip \
    && pecl install apcu \
    && docker-php-ext-enable apcu \
    && apk del .build-deps

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

ENV COMPOSER_HOME=/tmp/composer \
    COMPOSER_CACHE_DIR=/tmp/composer/cache

WORKDIR /app/apps/api

FROM base AS dev

ARG UID=1000
ARG GID=1000

RUN apk add --no-cache --virtual .build-deps $PHPIZE_DEPS linux-headers \
    && pecl install pcov \
    && docker-php-ext-enable pcov \
    && apk del .build-deps \
    && apk add --no-cache git unzip \
    && mkdir -p /tmp/composer \
    && chmod -R 0777 /tmp/composer

COPY docker/php/php.dev.ini /usr/local/etc/php/conf.d/zz-app.ini

FROM base AS prod

ENV APP_ENV=prod APP_DEBUG=0

COPY docker/php/php.prod.ini /usr/local/etc/php/conf.d/zz-app.ini
COPY apps/api/ /app/apps/api/

RUN composer install --no-dev --classmap-authoritative --no-interaction --no-progress \
    && composer dump-env prod \
    && php bin/console cache:warmup \
    && chown -R www-data:www-data var

USER www-data
