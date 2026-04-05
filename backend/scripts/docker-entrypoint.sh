#!/bin/sh

# Aguarda o banco de dados estar pronto
echo "Waiting for database to be ready..."
sleep 5

# Gera o client do Prisma (garantia extra)
# npx prisma generate

# Aplica as migrações em produção
echo "Applying database migrations..."
npx prisma migrate deploy

# Roda o seed para criar a conta ADM inicial
echo "Seeding initial admin account..."
# Note: seeding in production usually requires TS compilation or using compiled seed
# But since we have tsx in devDependencies and we are in production stage, 
# it's better to use the script from node if possible, or just npx.
npx prisma db seed

# Inicia a aplicação
echo "Starting application..."
exec node dist/server.js
