import asyncio
import contextlib
import logging
from typing import cast

import websockets
from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)


class WebSocketProxyConfig:
    """Configuration for WebSocket proxy endpoints"""

    def __init__(
        self,
        target_url: str,
        api_key: str | None = None,
        api_key_header: str = "Authorization",
        require_auth: bool = True,
    ):
        self.target_url = target_url.rstrip("/")
        self.api_key = api_key
        self.api_key_header = api_key_header
        self.require_auth = require_auth


class WebSocketProxyService:
    """Service to handle WebSocket proxy connections"""

    def __init__(self) -> None:
        self.configs: dict[str, WebSocketProxyConfig] = {}

    def register_proxy(self, path_prefix: str, config: WebSocketProxyConfig) -> None:
        """Register a new WebSocket proxy configuration for a path prefix"""
        self.configs[path_prefix] = config

    def get_config(self, path: str) -> WebSocketProxyConfig | None:
        """Get the proxy configuration for a given path"""
        for prefix, config in self.configs.items():
            if path.startswith(prefix):
                return config
        return None

    async def verify_auth(self, websocket: WebSocket) -> bool:
        """Verify the WebSocket connection has proper authentication"""
        # Implement your auth logic here
        # For now, just check if Authorization header exists
        return "authorization" in websocket.headers

    async def proxy_websocket(
        self,
        client_websocket: WebSocket,
        path: str,
        config: WebSocketProxyConfig,
    ) -> None:
        """Proxy WebSocket connection to the target URL"""

        # Build target URL
        target_url = f"{config.target_url.replace('http', 'ws')}/{path}"

        # Prepare headers for the target connection
        headers = {}
        if config.api_key is not None:
            api_key = cast(str, config.api_key)  # Type narrowing for ty
            if (
                config.api_key_header.lower() == "authorization"
                and not api_key.startswith("Bearer ")
            ):
                headers[config.api_key_header] = f"Bearer {api_key}"
            else:
                headers[config.api_key_header] = api_key

        try:
            # Connect to the target WebSocket
            logger.info(f"Connecting to target WebSocket: {target_url}")

            async with websockets.connect(
                target_url,
                extra_headers=headers,
            ) as target_websocket:
                logger.info("Connected to target WebSocket")

                # Create tasks for bidirectional message forwarding
                async def forward_to_target() -> None:
                    """Forward messages from client to target"""
                    try:
                        while True:
                            if (
                                client_websocket.client_state
                                == WebSocketState.DISCONNECTED
                            ):
                                break

                            message = await client_websocket.receive_text()
                            await target_websocket.send(message)
                            logger.debug(
                                f"Forwarded message to target: {message[:100]}..."
                            )
                    except WebSocketDisconnect:
                        logger.info("Client WebSocket disconnected")
                    except Exception as e:
                        logger.error(f"Error forwarding to target: {e}")

                async def forward_to_client() -> None:
                    """Forward messages from target to client"""
                    try:
                        async for message in target_websocket:
                            if (
                                client_websocket.client_state
                                == WebSocketState.DISCONNECTED
                            ):
                                break

                            # Ensure message is a string for send_text
                            if isinstance(message, bytes):
                                message_str = message.decode("utf-8")
                            else:
                                message_str = message

                            await client_websocket.send_text(message_str)
                            logger.debug(
                                f"Forwarded message to client: {message_str[:100]}..."
                            )
                    except WebSocketDisconnect:
                        logger.info("Client WebSocket disconnected")
                    except Exception as e:
                        logger.error(f"Error forwarding to client: {e}")

                # Run both forwarding tasks concurrently
                await asyncio.gather(
                    forward_to_target(),
                    forward_to_client(),
                    return_exceptions=True,
                )

        except ConnectionClosed:
            logger.info("Target WebSocket connection closed")
        except Exception as e:
            logger.error(f"WebSocket proxy error: {e}")
            # Try to close the client connection gracefully
            with contextlib.suppress(Exception):
                await client_websocket.close(code=1011, reason="Proxy error")


# Global WebSocket proxy service instance
ws_proxy_service = WebSocketProxyService()


async def get_ws_proxy_service() -> WebSocketProxyService:
    """Dependency to get the WebSocket proxy service"""
    return ws_proxy_service
