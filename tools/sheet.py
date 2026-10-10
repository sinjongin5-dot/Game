import sys
from PIL import Image
out = sys.argv[1]; files = sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
w = max(i.width for i in ims); h = max(i.height for i in ims)
cols = min(len(ims), 3); rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h))
for k, im in enumerate(ims): sheet.paste(im, ((k % cols) * w, (k // cols) * h))
sheet.save(out)
