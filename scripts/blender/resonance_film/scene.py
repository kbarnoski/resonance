"""Blender scene construction + per-frame application (bpy).

Look law, baked in here:
  * Standard view transform (the pack stills keep their authored colour),
    exposure 0, no auto-anything, no film grain, no lens flares.
  * World background pure black; a thin world fog (Principled Volume) and an
    optional drifting mist volume. Lights exist only to scatter in the fog
    (shafts); plates and motes are emissive, so no light ever "flashes" them.
  * Glow = compositor Bloom with a high threshold, low mix.
  * The master fade from / to black is a compositor multiply.
"""
import math
import os

import bpy
import numpy as np
from mathutils import Vector

from . import plates as plate_ops


_MIX_IDX = {"FLOAT": (2, 3, 0), "RGBA": (6, 7, 2)}


def mix_a(node):
    return node.inputs[_MIX_IDX[node.data_type][0]]


def mix_b(node):
    return node.inputs[_MIX_IDX[node.data_type][1]]


def mix_out(node):
    return node.outputs[_MIX_IDX[node.data_type][2]]


def srgb_to_linear(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def load_rgba(path):
    """Any image file -> HxWx4 float32, row 0 = top, sRGB-encoded values (as stored)."""
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = "sRGB"
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    arr = px.reshape(h, w, 4)[::-1].copy()
    return arr


def new_float_image(name, arr, colorspace="Linear Rec.709"):
    """HxWx4 (row 0 = top) -> an in-memory float image."""
    h, w = arr.shape[:2]
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=True)
    img.colorspace_settings.name = colorspace
    img.alpha_mode = "CHANNEL_PACKED"
    img.pixels.foreach_set(arr[::-1].astype(np.float32).ravel())
    img.pack()
    return img


def downsample2(arr):
    h, w = arr.shape[:2]
    h2, w2 = h // 2 * 2, w // 2 * 2
    a = arr[:h2, :w2]
    return 0.25 * (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2])


class FilmScene:
    def __init__(self, director, res, samples=32, preview=False, engine="BLENDER_EEVEE_NEXT"):
        self.d = director
        self.res = res
        self.preview = preview
        self._reset()
        sc = bpy.context.scene
        self.sc = sc
        r = sc.render
        r.engine = engine
        r.resolution_x, r.resolution_y = res
        r.resolution_percentage = 100
        r.fps = director.fps
        r.film_transparent = False
        r.use_motion_blur = False
        r.image_settings.file_format = "PNG"
        r.image_settings.color_mode = "RGB"
        r.image_settings.color_depth = "16"
        r.image_settings.compression = 15
        r.dither_intensity = 0.0  # no grain, ever (16-bit output; banding handled by the 10-bit encode)
        vs = sc.view_settings
        vs.view_transform = "Standard"
        vs.look = "None"
        vs.exposure = 0.0
        vs.gamma = 1.0
        sc.display_settings.display_device = "sRGB"
        if engine == "BLENDER_EEVEE_NEXT":
            ee = sc.eevee
            ee.taa_render_samples = samples
            ee.use_shadows = False
            ee.use_volumetric_shadows = False
            ee.volumetric_tile_size = "8" if preview else "4"
            ee.volumetric_samples = 32 if preview else 96
            ee.volumetric_sample_distribution = 0.8
            ee.volumetric_start = 0.1
            ee.volumetric_end = 110.0
            ee.use_raytracing = False
            ee.use_gtao = False
        else:
            sc.cycles.samples = samples
            sc.cycles.use_denoising = True
        self._world()
        self._camera()
        self._plates()
        self._motes()
        self._lights()
        self._mist()
        self._compositor()

    # ------------------------------------------------------------------
    def _reset(self):
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
            for b in list(coll):
                coll.remove(b)

    def _world(self):
        sc = bpy.context.scene
        w = sc.world or bpy.data.worlds.new("World")
        sc.world = w
        w.use_nodes = True
        nt = w.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputWorld")
        bg = nt.nodes.new("ShaderNodeBackground")
        bg.inputs["Color"].default_value = (0, 0, 0, 1)
        bg.inputs["Strength"].default_value = 0.0
        vol = nt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Anisotropy"].default_value = float(self.d.look.get("anisotropy", 0.55))
        vol.inputs["Density"].default_value = 0.01
        nt.links.new(bg.outputs[0], out.inputs["Surface"])
        nt.links.new(vol.outputs[0], out.inputs["Volume"])
        self.world_vol = vol

    def _camera(self):
        cd = bpy.data.cameras.new("FilmCam")
        cd.lens = self.d.lens
        cd.sensor_fit = "HORIZONTAL"
        cd.sensor_width = 36.0
        cd.clip_start = 0.05
        cd.clip_end = 400.0
        cd.dof.use_dof = False  # focus pulls are deterministic plate/mote defocus (director)
        cam = bpy.data.objects.new("FilmCam", cd)
        bpy.context.scene.collection.objects.link(cam)
        bpy.context.scene.camera = cam
        cam.rotation_mode = "XYZ"
        self.cam = cam

    def _plate_material(self, name, col_img, blur_img, mode):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = True
        nt = m.node_tree
        nt.nodes.clear()
        N = nt.nodes.new
        L = nt.links.new
        out = N("ShaderNodeOutputMaterial")
        uv = N("ShaderNodeTexCoord")
        t1 = N("ShaderNodeTexImage")
        t1.image = col_img
        t1.interpolation = "Cubic"
        t1.extension = "CLIP"
        t2 = N("ShaderNodeTexImage")
        t2.image = blur_img
        t2.interpolation = "Linear"
        t2.extension = "CLIP"
        L(uv.outputs["UV"], t1.inputs["Vector"])
        L(uv.outputs["UV"], t2.inputs["Vector"])
        blur = N("ShaderNodeValue")
        blur.name = "blur"
        op = N("ShaderNodeValue")
        op.name = "op"
        mixc = N("ShaderNodeMix")
        mixc.data_type = "RGBA"
        L(blur.outputs[0], mixc.inputs[0])
        L(t1.outputs["Color"], mix_a(mixc))
        L(t2.outputs["Color"], mix_b(mixc))
        mixa = N("ShaderNodeMix")
        mixa.data_type = "FLOAT"
        L(blur.outputs[0], mixa.inputs[0])
        L(t1.outputs["Alpha"], mix_a(mixa))
        L(t2.outputs["Alpha"], mix_b(mixa))
        # emission = premultiplied colour * opacity
        em_col = N("ShaderNodeMix")
        em_col.data_type = "RGBA"
        em_col.blend_type = "MULTIPLY"
        em_col.inputs[0].default_value = 1.0
        L(mix_out(mixc), mix_a(em_col))
        comb = N("ShaderNodeCombineColor")
        L(op.outputs[0], comb.inputs[0])
        L(op.outputs[0], comb.inputs[1])
        L(op.outputs[0], comb.inputs[2])
        L(comb.outputs[0], mix_b(em_col))
        em = N("ShaderNodeEmission")
        em.inputs["Strength"].default_value = 1.0
        L(mix_out(em_col), em.inputs["Color"])
        tr = N("ShaderNodeBsdfTransparent")
        if mode == "over":
            # transmittance = 1 - alpha * opacity
            m1 = N("ShaderNodeMath")
            m1.operation = "MULTIPLY"
            L(mix_out(mixa), m1.inputs[0])
            L(op.outputs[0], m1.inputs[1])
            m2 = N("ShaderNodeMath")
            m2.operation = "SUBTRACT"
            m2.inputs[0].default_value = 1.0
            m2.use_clamp = True
            L(m1.outputs[0], m2.inputs[1])
            c2 = N("ShaderNodeCombineColor")
            for k in range(3):
                L(m2.outputs[0], c2.inputs[k])
            L(c2.outputs[0], tr.inputs["Color"])
        else:
            tr.inputs["Color"].default_value = (1, 1, 1, 1)
        add = N("ShaderNodeAddShader")
        L(tr.outputs[0], add.inputs[0])
        L(em.outputs[0], add.inputs[1])
        L(add.outputs[0], out.inputs["Surface"])
        return m, op, blur

    def _plates(self):
        d = self.d
        self.plate_objs = []
        bdl = d.bundle
        for k, spec in enumerate(d.plates):
            rgba = load_rgba(bdl.path(spec["image"]))
            depth = None
            dm = spec.get("depth")
            if isinstance(dm, str) and dm.endswith(".png"):
                depth = load_rgba(bdl.path(dm))[..., 0]
            prep = plate_ops.prepare(rgba, spec, depth)
            col = prep["col"].copy()
            col[..., :3] = srgb_to_linear(col[..., :3] / np.maximum(col[..., 3:4], 1e-6)) * col[..., 3:4]
            blur = downsample2(prep["blur"])
            blur[..., :3] = srgb_to_linear(np.clip(blur[..., :3] / np.maximum(blur[..., 3:4], 1e-6), 0, 1)) * blur[..., 3:4]
            gain = float(spec.get("exposure", 1.0)) * float(d.look.get("plateExposure", 1.0))
            col[..., :3] *= gain
            blur[..., :3] *= gain
            ci = new_float_image(f"plate_{spec['id']}_col", col)
            bi = new_float_image(f"plate_{spec['id']}_blur", blur)
            aspect = prep["aspect"]
            width = float(spec.get("width", 0)) or float(spec.get("cover", 1.0)) * 2 * spec["dist_at"] * d.tanH
            height = width / aspect
            relief = float(spec.get("relief", 0.0))
            sub = 2
            if prep["depth"] is not None and relief > 0:
                sub = 64 if self.preview else 192
            bpy.ops.mesh.primitive_grid_add(x_subdivisions=sub, y_subdivisions=max(2, int(sub / aspect)),
                                            size=1.0, calc_uvs=True)
            ob = bpy.context.active_object
            ob.name = f"plate_{spec['id']}"
            ob.scale = (width, height, 1.0)
            tilt = math.radians(float(spec.get("tilt", 0.0)))
            ob.rotation_euler = (math.radians(90) + tilt, 0, 0)
            ob.location = spec["pos"]
            ob.visible_shadow = False
            if prep["depth"] is not None and relief > 0:
                dimg = np.repeat(prep["depth"][..., None], 4, axis=2)
                dimg[..., 3] = 1
                di = new_float_image(f"plate_{spec['id']}_depth", dimg, colorspace="Non-Color")
                tex = bpy.data.textures.new(f"plate_{spec['id']}_dtex", type="IMAGE")
                tex.image = di
                tex.extension = "EXTEND"
                tex.use_interpolation = True
                mod = ob.modifiers.new("relief", "DISPLACE")
                mod.texture = tex
                mod.texture_coords = "UV"
                mod.direction = "NORMAL"
                mod.space = "LOCAL"
                mod.mid_level = float(spec.get("midLevel", 0.35))
                mod.strength = relief
            m, op, blurn = self._plate_material(f"mat_plate_{spec['id']}", ci, bi, spec.get("blend", "add"))
            ob.data.materials.append(m)
            self.plate_objs.append((ob, op, blurn))

    def _motes(self):
        n = self.d.n_motes
        self.motes = None
        if n == 0:
            return
        me = bpy.data.meshes.new("motes")
        me.vertices.add(n)
        me.attributes.new("size", "FLOAT", "POINT")
        me.attributes.new("alpha", "FLOAT", "POINT")
        me.attributes.new("col", "FLOAT_COLOR", "POINT")
        ob = bpy.data.objects.new("motes", me)
        bpy.context.scene.collection.objects.link(ob)
        ob.visible_shadow = False
        # material: soft additive sphere glow, colour/alpha from the instancer
        m = bpy.data.materials.new("mat_motes")
        m.use_nodes = True
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = True
        nt = m.node_tree
        nt.nodes.clear()
        N = nt.nodes.new
        L = nt.links.new
        out = N("ShaderNodeOutputMaterial")
        ac = N("ShaderNodeAttribute")
        ac.attribute_type = "INSTANCER"
        ac.attribute_name = "col"
        aa = N("ShaderNodeAttribute")
        aa.attribute_type = "INSTANCER"
        aa.attribute_name = "alpha"
        lw = N("ShaderNodeLayerWeight")
        lw.inputs["Blend"].default_value = 0.5
        inv = N("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        L(lw.outputs["Facing"], inv.inputs[1])
        pw = N("ShaderNodeMath")
        pw.operation = "POWER"
        pw.inputs[1].default_value = 2.2
        pw.use_clamp = True
        L(inv.outputs[0], pw.inputs[0])
        mul = N("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        L(pw.outputs[0], mul.inputs[0])
        L(aa.outputs["Fac"], mul.inputs[1])
        cm = N("ShaderNodeMix")
        cm.data_type = "RGBA"
        cm.blend_type = "MULTIPLY"
        cm.inputs[0].default_value = 1.0
        L(ac.outputs["Color"], mix_a(cm))
        cc = N("ShaderNodeCombineColor")
        for k in range(3):
            L(mul.outputs[0], cc.inputs[k])
        L(cc.outputs[0], mix_b(cm))
        em = N("ShaderNodeEmission")
        em.inputs["Strength"].default_value = float(self.d.look.get("moteGain", 1.6))
        L(mix_out(cm), em.inputs["Color"])
        tr = N("ShaderNodeBsdfTransparent")
        add = N("ShaderNodeAddShader")
        L(tr.outputs[0], add.inputs[0])
        L(em.outputs[0], add.inputs[1])
        L(add.outputs[0], out.inputs["Surface"])
        # geometry nodes: a smooth ico-sphere instanced on every point, scaled by 'size'
        ng = bpy.data.node_groups.new("mote_instancer", "GeometryNodeTree")
        ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
        ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
        gi = ng.nodes.new("NodeGroupInput")
        go = ng.nodes.new("NodeGroupOutput")
        ico = ng.nodes.new("GeometryNodeMeshIcoSphere")
        ico.inputs["Radius"].default_value = 1.0
        ico.inputs["Subdivisions"].default_value = 2
        smooth = ng.nodes.new("GeometryNodeSetShadeSmooth")
        setm = ng.nodes.new("GeometryNodeSetMaterial")
        setm.inputs["Material"].default_value = m
        mtp = ng.nodes.new("GeometryNodeMeshToPoints")
        iop = ng.nodes.new("GeometryNodeInstanceOnPoints")
        na = ng.nodes.new("GeometryNodeInputNamedAttribute")
        na.data_type = "FLOAT"
        na.inputs["Name"].default_value = "size"
        ng.links.new(gi.outputs[0], mtp.inputs["Mesh"])
        ng.links.new(mtp.outputs["Points"], iop.inputs["Points"])
        ng.links.new(ico.outputs["Mesh"], smooth.inputs["Geometry"])
        ng.links.new(smooth.outputs["Geometry"], setm.inputs["Geometry"])
        ng.links.new(setm.outputs["Geometry"], iop.inputs["Instance"])
        ng.links.new(na.outputs["Attribute"], iop.inputs["Scale"])
        ng.links.new(iop.outputs["Instances"], go.inputs[0])
        mod = ob.modifiers.new("instancer", "NODES")
        mod.node_group = ng
        self.motes = ob

    def _lights(self):
        self.light_objs = []
        for k, spec in enumerate(self.d.lights):
            ld = bpy.data.lights.new(f"light_{k}", spec.get("type", "SPOT"))
            ld.use_shadow = False
            ld.volume_factor = float(spec.get("volume", 1.0))
            ld.diffuse_factor = 0.0
            ld.specular_factor = 0.0
            if ld.type == "SPOT":
                ld.spot_size = math.radians(float(spec.get("spot", 30)))
                ld.spot_blend = float(spec.get("blend", 0.9))
            ld.shadow_soft_size = float(spec.get("radius", 0.5))
            ob = bpy.data.objects.new(f"light_{k}", ld)
            bpy.context.scene.collection.objects.link(ob)
            ob.location = spec["pos"]
            aim = Vector(spec.get("aim", [0, 10, 0]))
            ob.rotation_mode = "QUATERNION"
            ob.rotation_quaternion = (aim - Vector(spec["pos"])).to_track_quat("-Z", "Y")
            self.light_objs.append(ob)

    def _mist(self):
        """A volume box around the camera path: a homogeneous haze (so light
        shafts exist - EEVEE Next's world volume scatters little) plus optional
        drifting mist (4D noise in WORLD space, advected on a steady clock)."""
        mist = self.d.look.get("mist") or {}
        haze = float(self.d.look.get("haze", 0.0))
        self.mist = None
        if not mist and haze <= 0:
            return
        bpy.ops.mesh.primitive_cube_add(size=1.0)
        ob = bpy.context.active_object
        ob.name = "mist"
        lo, hi = mist.get("box", self.d.look.get("hazeBox", [[-60, -10, -35], [60, 95, 45]]))
        ob.location = [(a + b) / 2 for a, b in zip(lo, hi)]
        ob.scale = [(b - a) for a, b in zip(lo, hi)]
        m = bpy.data.materials.new("mat_mist")
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        N = nt.nodes.new
        L = nt.links.new
        out = N("ShaderNodeOutputMaterial")
        vol = N("ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = (*mist.get("color", self.d.look.get("hazeColor", [0.6, 0.62, 0.66])), 1)
        vol.inputs["Anisotropy"].default_value = float(self.d.look.get("hazeAnisotropy", 0.6))
        mw = N("ShaderNodeValue")
        mw.name = "mistW"
        if mist.get("density", 0) > 0:
            geo = N("ShaderNodeNewGeometry")
            noise = N("ShaderNodeTexNoise")
            noise.noise_dimensions = "4D"
            noise.inputs["Scale"].default_value = float(mist.get("scale", 0.16))
            noise.inputs["Detail"].default_value = 3.0
            noise.inputs["Roughness"].default_value = 0.55
            L(geo.outputs["Position"], noise.inputs["Vector"])
            L(mw.outputs[0], noise.inputs["W"])
            ramp = N("ShaderNodeMapRange")
            ramp.inputs["From Min"].default_value = 0.42
            ramp.inputs["From Max"].default_value = 0.75
            ramp.inputs["To Min"].default_value = 0.0
            ramp.inputs["To Max"].default_value = float(mist["density"])
            L(noise.outputs["Fac"], ramp.inputs["Value"])
            add = N("ShaderNodeMath")
            add.operation = "ADD"
            add.inputs[1].default_value = haze
            L(ramp.outputs["Result"], add.inputs[0])
            L(add.outputs[0], vol.inputs["Density"])
        else:
            vol.inputs["Density"].default_value = haze
        L(vol.outputs[0], out.inputs["Volume"])
        ob.data.materials.append(m)
        ob.visible_shadow = False
        self.mist = (ob, mw, float(mist.get("speed", 0.02)))

    def _compositor(self):
        sc = bpy.context.scene
        sc.use_nodes = True
        nt = sc.node_tree
        nt.nodes.clear()
        rl = nt.nodes.new("CompositorNodeRLayers")
        comp = nt.nodes.new("CompositorNodeComposite")
        last = rl.outputs["Image"]
        glow = float(self.d.look.get("glow", 0.25))
        if glow > 0:
            g = nt.nodes.new("CompositorNodeGlare")
            g.glare_type = "BLOOM"
            g.quality = "HIGH"
            g.threshold = float(self.d.look.get("glowThreshold", 0.6))
            g.size = int(self.d.look.get("glowSize", 8))
            g.mix = -1.0 + 2.0 * glow * 0.5  # -1 = image only
            nt.links.new(last, g.inputs["Image"])
            last = g.outputs["Image"]
        mul = nt.nodes.new("CompositorNodeMixRGB")
        mul.blend_type = "MULTIPLY"
        mul.inputs[0].default_value = 1.0
        nt.links.new(last, mul.inputs[1])
        mul.inputs[2].default_value = (1, 1, 1, 1)
        nt.links.new(mul.outputs[0], comp.inputs["Image"])
        self.master_node = mul

    # ------------------------------------------------------------------
    def apply(self, st):
        self.cam.location = st["cam_pos"]
        self.cam.rotation_euler = st["cam_euler"]
        for (ob, op, blurn), p in zip(self.plate_objs, st["plates"]):
            vis = p["op"] > 1e-4
            ob.hide_render = not vis
            op.outputs[0].default_value = p["op"]
            blurn.outputs[0].default_value = p["blur"]
        if self.motes is not None and st["motes"] is not None:
            m = st["motes"]
            me = self.motes.data
            me.vertices.foreach_set("co", m["pos"].ravel())
            me.attributes["size"].data.foreach_set("value", m["size"])
            me.attributes["alpha"].data.foreach_set("value", m["alpha"])
            rgba = np.concatenate([m["col"], np.ones((len(m["col"]), 1), np.float32)], axis=1)
            me.attributes["col"].data.foreach_set("color", rgba.ravel())
            me.update()
        for ob, L in zip(self.light_objs, st["lights"]):
            ob.data.energy = L["energy"]
            ob.data.color = L["color"]
        self.world_vol.inputs["Density"].default_value = st["fog"]
        self.world_vol.inputs["Color"].default_value = (*st["fog_color"], 1)
        if self.mist:
            ob, mw, speed = self.mist
            mw.outputs[0].default_value = st["t"] * speed
        m = st["master"]
        self.master_node.inputs[2].default_value = (m, m, m, 1)

    def render(self, path):
        self.sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
