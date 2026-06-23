from PIL import Image
import numpy as np

img = Image.open('frontend/public/nexus-avatar.png').convert('RGBA')
data = np.array(img)

r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]

# Brightness of each pixel
brightness = r.astype(int) + g.astype(int) + b.astype(int)

# Black/dark pixels -> transparent, with soft edge via feathering
threshold_hard = 60   # fully transparent below this brightness
threshold_soft = 160  # start fading between hard and soft

alpha = np.where(
    brightness < threshold_hard * 3,
    0,
    np.where(
        brightness > threshold_soft * 3,
        255,
        ((brightness - threshold_hard * 3) / ((threshold_soft - threshold_hard) * 3) * 255).astype(int)
    )
).astype(np.uint8)

data[:,:,3] = alpha

result = Image.fromarray(data)
result.save('frontend/public/nexus-avatar.png')
print(f"Done. Image size: {result.size}")
