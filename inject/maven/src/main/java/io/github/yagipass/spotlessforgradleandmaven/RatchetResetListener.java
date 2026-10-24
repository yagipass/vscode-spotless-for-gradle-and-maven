package io.github.yagipass.spotlessforgradleandmaven;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Properties;
import java.util.Set;
import javax.inject.Named;
import javax.inject.Singleton;
import org.apache.maven.execution.MojoExecutionEvent;
import org.apache.maven.execution.MojoExecutionListener;

@Named("spotlessForGradleAndMavenRatchetReset")
@Singleton
public class RatchetResetListener implements MojoExecutionListener {

  @Override
  public void beforeMojoExecution(MojoExecutionEvent event) {
    if (!"spotless-maven-plugin".equals(event.getExecution().getArtifactId())) {
      return;
    }
    Class<?> ratchet;
    Object stale;
    Object fresh;
    try {
      ratchet =
          Class.forName(
              "com.diffplug.spotless.maven.GitRatchetMaven",
              true,
              event.getMojo().getClass().getClassLoader());
      Field instance = ratchet.getDeclaredField("instance");
      Constructor<?> constructor = ratchet.getDeclaredConstructor();
      instance.setAccessible(true);
      constructor.setAccessible(true);
      stale = instance.get(null);
      fresh = constructor.newInstance();
      instance.set(null, fresh);
    } catch (ReflectiveOperationException | RuntimeException e) {
      return;
    }
    close(stale);
    File edited = editedHookFile(event.getSession().getUserProperties());
    if (edited != null) {
      listAsChanged(ratchet, fresh, event.getProject().getBasedir(), edited);
    }
  }

  private static void close(Object stale) {
    if (stale instanceof AutoCloseable) {
      try {
        ((AutoCloseable) stale).close();
      } catch (Exception e) {
        return;
      }
    }
  }

  private static File editedHookFile(Properties properties) {
    String hook = properties.getProperty("spotlessIdeHook");
    String stdin = properties.getProperty("spotlessForGradleAndMaven.stdin");
    if (hook == null || stdin == null) {
      return null;
    }
    File file = new File(hook);
    try {
      if (file.isFile()
          && Arrays.equals(
              Files.readAllBytes(file.toPath()), Files.readAllBytes(new File(stdin).toPath()))) {
        return null;
      }
    } catch (IOException e) {
      return null;
    }
    return file;
  }

  private static void listAsChanged(Class<?> ratchet, Object fresh, File baseDir, File edited) {
    try {
      Field cache = ratchet.getDeclaredField("cache");
      Method repositoryFor =
          ratchet.getSuperclass().getDeclaredMethod("repositoryFor", Object.class);
      cache.setAccessible(true);
      repositoryFor.setAccessible(true);
      cache.set(fresh, new WithEditedFile(fresh, repositoryFor, baseDir, edited));
    } catch (ReflectiveOperationException | RuntimeException e) {
      return;
    }
  }

  private static final class WithEditedFile extends HashMap<Object, Set<String>> {

    private final Object ratchet;
    private final Method repositoryFor;
    private final File baseDir;
    private final File edited;

    WithEditedFile(Object ratchet, Method repositoryFor, File baseDir, File edited) {
      this.ratchet = ratchet;
      this.repositoryFor = repositoryFor;
      this.baseDir = baseDir;
      this.edited = edited;
    }

    @Override
    public Set<String> put(Object key, Set<String> changed) {
      addIfTracked(changed);
      return super.put(key, changed);
    }

    private void addIfTracked(Set<String> changed) {
      try {
        Object repository = repositoryFor.invoke(ratchet, baseDir);
        File workTree = (File) repository.getClass().getMethod("getWorkTree").invoke(repository);
        Path relative = workTree.toPath().relativize(edited.toPath());
        String path = relative.toString().replace(File.separatorChar, '/');
        Object index = repository.getClass().getMethod("readDirCache").invoke(repository);
        Method findEntry = index.getClass().getMethod("findEntry", String.class);
        if (!relative.startsWith("..") && (Integer) findEntry.invoke(index, path) >= 0) {
          changed.add(path);
        }
      } catch (ReflectiveOperationException | RuntimeException e) {
        return;
      }
    }
  }

  @Override
  public void afterMojoExecutionSuccess(MojoExecutionEvent event) {}

  @Override
  public void afterExecutionFailure(MojoExecutionEvent event) {}
}
