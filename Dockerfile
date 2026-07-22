FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o backend .

# use minimal image
FROM alpine:latest

WORKDIR /app
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/backend .
COPY --from=builder /app/public ./public  
EXPOSE 3000
CMD ["./backend"]

