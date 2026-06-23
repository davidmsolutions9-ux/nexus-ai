from PIL import Image
import numpy as np
from collections import deque

input_path = r'C:\Users\Usuario\.claude\uploads\4868ed61-9c70-42fe-b8b4-4e9f6185807a\6067f151-IMG_3291.jpeg'
output_path = 'frontend/public/nexus-avatar.png'

img = Image.open(input_path).convert('RGBA')
data = np.array(img, dtype=np.int32)
h, w = data.shape[:2]

# Sample background color from corners
corners = [data[0,0,:3], data[0,-1,:3], data[5,5,:3], data[5,-6,:3]]
bg = np.mean(corners, axis=0)  # ~dark navy blue
print(f"Background color: {bg}")

# Flood fill from all 4 edges to find background pixels
visited = np.zeros((h, w), dtype=bool)
mask = np.zeros((h, w), dtype=bool)  # True = background

queue = deque()
# Seed from all edges
for x in range(w):
    queue.append((0, x))
    queue.append((h-1, x))
for y in range(h):
    queue.append((y, 0))
    queue.append((y, w-1))

tolerance = 45  # color distance threshold

while queue:
    y, x = queue.popleft()
    if visited[y, x]:
        continue
    visited[y, x] = True
    pixel = data[y, x, :3]
    dist = np.sqrt(np.sum((pixel - bg) ** 2))
    if dist < tolerance:
        mask[y, x] = True
        for dy, dx in [(-1,0),(1,0),(0,-1),(0,1)]:
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                queue.append((ny, nx))

# Soften edges with a small feather
from scipy.ndimage import binary_dilation, gaussian_filter
mask_float = mask.astype(np.float32)
mask_float = gaussian_filter(mask_float, sigma=2)

result = np.array(img, dtype=np.uint8)
alpha = np.clip((1.0 - mask_float) * 255, 0, 255).astype(np.uint8)
result[:, :, 3] = alpha

out = Image.fromarray(result)
out.save(output_path)
print(f"Done. Transparent pixels: {(alpha < 50).sum()}")
