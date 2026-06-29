FROM golang:1.25-alpine AS builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

ENV GOTOOLCHAIN=local

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go get go.mau.fi/whatsmeow@latest && \
    go get github.com/skip2/go-qrcode@v0.0.0-20200617195104-da1b6568686e && \
    go mod tidy
RUN CGO_ENABLED=1 go build -o whatsapp-bridge .

FROM alpine:latest

RUN apk add --no-cache ca-certificates sqlite-libs

WORKDIR /app
RUN mkdir -p store

COPY --from=builder /build/whatsapp-bridge /app/whatsapp-bridge

EXPOSE 8080

CMD ["/app/whatsapp-bridge"]
